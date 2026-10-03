"""In-memory integration tests. Never connects to Turso or deletes real photos."""
import sqlite3, unittest, json
from pathlib import Path

class Deletion(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:');self.db.execute('PRAGMA foreign_keys=ON')
  for f in sorted(Path('database/migrations').glob('*.sql')):
   for s in f.read_text().split('--> statement-breakpoint'):
    if s.strip():self.db.execute(s)
  for uid,role in [('admin','ADMIN'),('other','ADMIN'),('faculty','FACULTY'),('student','STUDENT'),('peer','STUDENT')]:
   self.db.execute('INSERT INTO users(id,email,name,role,password,created_at) VALUES(?,?,?,?,?,?)',(uid,uid+'@example.test',uid,role,'hash','2026-01-01'))
  self.db.execute("INSERT INTO events(id,title,category,description,start,end,deadline,hours,location,lat,lng,radius,capacity,coordinator,status,created_at) VALUES('event','Test','Service','Test','2026-01-01','2026-01-02','2026-01-01',4,'Campus',19,72,250,10,'other','Ongoing','2026-01-01')")
  for uid in ['student','peer']:
   self.db.execute("INSERT INTO attendance(id,event_id,user_id,year,status,original_in,effective_in,created_at) VALUES(?,'event',?,1,'CHECKED_IN','original','original','2026-01-01')",(uid,uid))
   self.db.execute("INSERT INTO evidence VALUES(?,?,?,'image/png','{}',NULL,'APPROVED','','2026-01-01')",(uid,uid,'evidence/'+uid+'/photo'))
   self.db.execute("INSERT INTO adjustments VALUES(?,?,'other','{}','{}','Verified','2026-01-01')",(uid,uid))
   loc=json.dumps(dict(lat=19,lng=72,accuracy=8,inside=True,status='Location verified'))
   self.db.execute("UPDATE attendance SET original_out='original-out',effective_out='original-out',location_in=?,location_out=?,status='APPROVED' WHERE id=?",(loc,loc,uid))
   self.db.execute("INSERT INTO hour_ledger VALUES(?,?,?,1,4,'Verified','other',0,'2026-01-01')",(uid,uid,uid))
   self.db.execute("INSERT INTO corrections VALUES(?,?,'Time','Please review','PENDING','','2026-01-01')",(uid,uid))
   for entity in ['users','attendance','evidence']:
    self.db.execute("INSERT INTO audit_logs VALUES(?,'other','ADMIN','Reviewed',?,?, '{}','{}','Reason','2026-01-01')",(entity+uid,entity,uid))
   self.db.execute("INSERT INTO sessions VALUES(?,?,'2099-01-01')",(uid,uid))
   self.db.execute("INSERT INTO resets VALUES(?,?,?,'2099-01-01','ISSUED','2026-01-01')",(uid,uid,uid))
   self.db.execute("INSERT INTO notifications VALUES(?,?,'Hello','Text',0,'2026-01-01')",(uid,uid))
   self.db.execute("INSERT INTO upload_intents VALUES(?,?,?,?,'image/png',100,'{}','2099-01-01','2026-01-01')",(uid,uid,uid,'evidence/'+uid+'/pending'))
  self.db.commit()
 def tearDown(self):self.db.close()
 def delete(self,target='student',actor='admin',email=None,password='hash',reason='Requested deletion'):
  self.db.execute('INSERT INTO account_deletions VALUES(?,?,?,?,?,?,?)',('job-'+target,target,actor,email or target+'@example.test',password,reason,'2026-01-01'))
 def test_student_deleted_peer_unchanged(self):
  self.delete()
  for table in ['users','attendance','hour_ledger','evidence','adjustments','corrections','sessions','resets','notifications','upload_intents']:
   self.assertIsNone(self.db.execute(f"SELECT id FROM {table} WHERE id='student'").fetchone(),table)
   self.assertIsNotNone(self.db.execute(f"SELECT id FROM {table} WHERE id='peer'").fetchone(),table)
  self.assertEqual(self.db.execute("SELECT SUM(delta) FROM hour_ledger WHERE user_id='peer'").fetchone()[0],4)
  self.assertEqual(self.db.execute('SELECT COUNT(*) FROM account_deletions').fetchone()[0],0)
  self.assertEqual(self.db.execute('SELECT prefix FROM deletion_blob_jobs').fetchone()[0],'evidence/student/')
  self.assertEqual(self.db.execute("SELECT COUNT(*) FROM audit_logs WHERE entity_id='student'").fetchone()[0],0)
  self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(),[])
 def test_other_admin_deleted_and_authorship_preserved(self):
  self.delete('other')
  self.assertEqual(self.db.execute("SELECT coordinator FROM events").fetchone()[0],'admin')
  for table in ['hour_ledger','adjustments']:
   self.assertEqual(self.db.execute(f'SELECT DISTINCT actor FROM {table}').fetchall(),[('__deleted_actor__',)])
  self.assertEqual(self.db.execute('SELECT SUM(delta) FROM hour_ledger').fetchone()[0],8)
  self.assertEqual(self.db.execute("SELECT actor FROM audit_logs WHERE id='attendancepeer'").fetchone()[0],'__deleted_actor__')
  self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(),[])
 def test_nonadmin_cannot_delete(self):
  for actor in ['student','faculty','missing']:
   with self.assertRaises(sqlite3.IntegrityError):self.delete(actor=actor)
 def test_self_and_system_forbidden(self):
  for target in ['admin','__deleted_actor__']:
   with self.assertRaises(sqlite3.IntegrityError):self.delete(target)
 def test_wrong_confirmation_or_changed_password(self):
  for kw in [{'email':'wrong@example.test'},{'password':'wrong'},{'reason':''}]:
   with self.assertRaises(sqlite3.IntegrityError):self.delete(**kw)
 def test_stale_admin_cannot_finish_delete(self):
  self.db.execute("UPDATE users SET active=0 WHERE id='admin'")
  with self.assertRaises(sqlite3.IntegrityError):self.delete()
 def test_last_admin_cannot_be_disabled(self):
  self.delete('other')
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE users SET active=0 WHERE id='admin'")
 def test_direct_delete_and_ordinary_history_mutation_blocked(self):
  for query in ["DELETE FROM users WHERE id='student'","DELETE FROM attendance","DELETE FROM hour_ledger","DELETE FROM audit_logs","UPDATE hour_ledger SET actor='__deleted_actor__'","UPDATE adjustments SET reason='x'","UPDATE users SET active=1 WHERE id='__deleted_actor__'"]:
   with self.assertRaises(sqlite3.IntegrityError):self.db.execute(query)
 def test_failed_delete_rolls_back_queue_history_and_user(self):
  self.db.execute("CREATE TRIGGER inject_failure BEFORE DELETE ON users WHEN OLD.id='student' BEGIN SELECT RAISE(ABORT,'injected'); END")
  with self.assertRaises(sqlite3.IntegrityError):self.delete()
  self.assertEqual(self.db.execute('SELECT COUNT(*) FROM account_deletions').fetchone()[0],0)
  self.assertEqual(self.db.execute('SELECT COUNT(*) FROM deletion_blob_jobs').fetchone()[0],0)
  self.assertIsNotNone(self.db.execute("SELECT id FROM users WHERE id='student'").fetchone())
  self.assertEqual(self.db.execute('SELECT SUM(delta) FROM hour_ledger').fetchone()[0],8)
 def test_deleted_admin_cannot_write_late_audit(self):
  self.delete('other')
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("INSERT INTO audit_logs VALUES('late','other','ADMIN','Edit','users','peer','{}','{}','Late','2026-01-01')")
 def test_repeated_delete_does_not_create_duplicate_job(self):
  self.delete()
  with self.assertRaises(sqlite3.IntegrityError):self.delete()
  self.assertEqual(self.db.execute('SELECT COUNT(*) FROM deletion_blob_jobs').fetchone()[0],1)

if __name__=='__main__':unittest.main()
