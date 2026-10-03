"""Production migration regression tests using disposable SQLite only."""
import sqlite3, unittest
from pathlib import Path
class ProgramUpdate(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:'); self.db.execute('PRAGMA foreign_keys=ON')
  self.clock='2026-10-07T18:29:59.999Z'
  self.db.create_function('strftime',2,lambda fmt,value:self.clock)
  for f in sorted(Path('database/migrations').glob('*.sql')):
   for stmt in f.read_text().split('--> statement-breakpoint'):
    if stmt.strip():self.db.execute(stmt)
  for uid,role in [('admin','ADMIN'),('admin2','ADMIN'),('faculty','FACULTY'),('student','STUDENT'),('peer','STUDENT')]:
   self.db.execute('INSERT INTO users(id,email,name,role,password,created_at) VALUES(?,?,?,?,?,?)',(uid,uid+'@example.test',uid,role,'hash',self.clock))
  self.db.commit()
 def tearDown(self):self.db.close()
 def credit(self,delta=12,balance=12,revision=1,actor='faculty',student='student',year=1):
  self.db.execute('INSERT INTO historical_hours VALUES(?,?,?,?,?,?,?,?,?,?,?)',(f'{student}-{year}-{revision}',student,year,delta,balance,revision,'Signed logbook','Verified opening service','2026-10-06',actor,self.clock))
 def test_faculty_cutoff_and_admin_exception(self):
  self.credit()
  self.clock='2026-10-07T18:30:00.000Z'
  with self.assertRaises(sqlite3.IntegrityError):self.credit(1,13,2)
  self.credit(1,13,2,actor='admin')
  self.assertEqual(self.db.execute('SELECT SUM(delta) FROM service_credits').fetchone()[0],13)
 def test_students_cannot_credit(self):
  for actor in ['student','peer']:
   with self.assertRaises(sqlite3.IntegrityError):self.credit(actor=actor)
 def test_inactive_faculty_cannot_credit(self):
  self.db.execute("UPDATE users SET active=0 WHERE id='faculty'")
  with self.assertRaises(sqlite3.IntegrityError):self.credit()
 def test_revision_and_balance_guards(self):
  self.credit()
  for delta,balance,revision in [(12,24,1),(2,99,2),(2,14,3),(-13,-1,2)]:
   with self.assertRaises(sqlite3.IntegrityError):self.credit(delta,balance,revision)
  self.credit(-2,10,2)
  self.assertEqual(self.db.execute('SELECT SUM(delta) FROM historical_hours').fetchone()[0],10)
 def test_history_immutable(self):
  self.credit()
  for query in ['DELETE FROM historical_hours',"UPDATE historical_hours SET reason='Changed'",'UPDATE historical_hours SET delta=20']:
   with self.assertRaises(sqlite3.IntegrityError):self.db.execute(query)
 def test_years_and_peer_balances_separate(self):
  self.credit();self.credit(130,130,year=2);self.credit(9,9,student='peer')
  self.assertEqual(self.db.execute("SELECT year,SUM(delta) FROM service_credits WHERE user_id='student' GROUP BY year").fetchall(),[(1,12),(2,130)])
 def test_bulk_failure_rolls_back(self):
  try:
   with self.db:
    self.credit()
    self.credit(actor='student',student='peer')
  except sqlite3.IntegrityError:pass
  self.assertEqual(self.db.execute('SELECT COUNT(*) FROM historical_hours').fetchone()[0],0)
 def test_account_deletion_purges_opening_hours(self):
  self.credit()
  self.db.execute("INSERT INTO account_deletions VALUES('delete','student','admin','student@example.test','hash','Requested',?)",(self.clock,))
  self.assertEqual(self.db.execute('SELECT COUNT(*) FROM historical_hours').fetchone()[0],0)
 def test_actor_deletion_preserves_other_students_hours(self):
  self.credit()
  self.db.execute("INSERT INTO account_deletions VALUES('delete','faculty','admin','faculty@example.test','hash','Requested',?)",(self.clock,))
  self.assertEqual(self.db.execute('SELECT SUM(delta),actor FROM historical_hours').fetchone(),(12,'__deleted_actor__'))
 def test_categories_seeded_with_descriptions(self):
  self.assertEqual(self.db.execute("SELECT COUNT(*) FROM catalogs WHERE kind='category' AND json_extract(details,'$.description') IS NOT NULL").fetchone()[0],12)
 def test_existing_attendance_and_historical_sum(self):
  self.credit()
  self.db.execute("INSERT INTO events(id,title,category,description,start,end,deadline,hours,location,lat,lng,radius,capacity,coordinator,status,created_at) VALUES('e','Live event','Service','Activity','2026-10-01','2026-10-02','2026-09-30',4,'Campus',19,72,100,20,'faculty','Completed',?)",(self.clock,))
  self.db.execute("INSERT INTO attendance(id,event_id,user_id,year,status,original_in,original_out,effective_in,effective_out,created_at) VALUES('a','e','student',1,'APPROVED','2026-10-01T10:00:00Z','2026-10-01T14:00:00Z','2026-10-01T10:00:00Z','2026-10-01T14:00:00Z',?)",(self.clock,))
  self.db.execute("INSERT INTO hour_ledger VALUES('l','a','student',1,4,'Verified','faculty',0,?)",(self.clock,))
  self.assertEqual(self.db.execute("SELECT SUM(delta) FROM service_credits WHERE user_id='student'").fetchone()[0],16)
  self.credit(-2,10,2)
  self.assertEqual(self.db.execute("SELECT SUM(delta) FROM service_credits WHERE user_id='student'").fetchone()[0],14)
  self.assertEqual(self.db.execute('SELECT original_in,original_out FROM attendance').fetchone(),('2026-10-01T10:00:00Z','2026-10-01T14:00:00Z'))
if __name__=='__main__':unittest.main()
