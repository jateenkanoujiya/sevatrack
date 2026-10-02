"""Disposable, in-memory tests of the exact production SQLite migrations."""
import sqlite3, unittest
from pathlib import Path
class Integrity(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:');self.db.execute('PRAGMA foreign_keys=ON')
  for f in sorted(Path('database/migrations').glob('*.sql')):
   for statement in f.read_text().split('--> statement-breakpoint'):
    if statement.strip():self.db.execute(statement)
  self.db.execute("INSERT INTO users(id,email,name,role,created_at) VALUES('student','s@example.test','Test student','STUDENT','2026-01-01'),('faculty','f@example.test','Test faculty','FACULTY','2026-01-01')")
  self.db.execute("INSERT INTO events(id,title,category,description,start,end,deadline,hours,location,lat,lng,radius,capacity,coordinator,status,created_at) VALUES('event','Test','Service','Test','2026-01-01','2026-01-02','2026-01-01',4,'Campus',19,72,250,10,'faculty','Ongoing','2026-01-01')")
  self.db.execute("INSERT INTO attendance(id,event_id,user_id,year,status,original_in,original_out,effective_in,effective_out,created_at) VALUES('attendance','event','student',1,'PENDING_REVIEW','2026-01-01T10:00:00Z','2026-01-01T14:00:00Z','2026-01-01T10:00:00Z','2026-01-01T14:00:00Z','2026-01-01')")
  self.db.commit()
 def tearDown(self):self.db.close()
 def test_original_times_immutable(self):
  for column in ['original_in','original_out']:
   with self.assertRaises(sqlite3.IntegrityError):self.db.execute(f'UPDATE attendance SET {column}=NULL')
  self.db.execute("UPDATE attendance SET effective_in='2026-01-01T11:00:00Z',revision=revision+1")
  self.assertEqual(self.db.execute('SELECT original_in FROM attendance').fetchone()[0],'2026-01-01T10:00:00Z')
 def test_identity_immutable(self):
  for column,value in [('year',2),('user_id','faculty'),('event_id','other')]:
   with self.assertRaises(sqlite3.IntegrityError):self.db.execute(f'UPDATE attendance SET {column}=?',(value,))
 def credit(self,n,revision=0,year=1):
  self.db.execute('INSERT INTO hour_ledger(id,attendance_id,user_id,year,delta,reason,actor,revision,created_at) VALUES(?,?,?,?,?,?,?,?,?)',(str(revision),'attendance','student',year,n,'Verified','faculty',revision,'2026-01-01'))
 def test_ledger_guards(self):
  for value in [-1,25]:
   with self.assertRaises(sqlite3.IntegrityError):self.credit(value)
  with self.assertRaises(sqlite3.IntegrityError):self.credit(4,year=2)
  self.credit(4)
  for query in ['UPDATE hour_ledger SET delta=9','DELETE FROM hour_ledger']:
   with self.assertRaises(sqlite3.IntegrityError):self.db.execute(query)
 def test_atomic_rollback(self):
  try:
   with self.db:
    self.db.execute("UPDATE attendance SET status='APPROVED',revision=1")
    self.credit(25,revision=1)
  except sqlite3.IntegrityError:pass
  self.assertEqual(self.db.execute('SELECT status,revision FROM attendance').fetchone(),('PENDING_REVIEW',0))
  self.assertEqual(self.db.execute('SELECT COUNT(*) FROM hour_ledger').fetchone()[0],0)
 def test_correction_ledger(self):
  self.credit(4);self.db.execute('UPDATE attendance SET revision=1');self.credit(-1,revision=1)
  self.assertEqual(self.db.execute('SELECT SUM(delta) FROM hour_ledger').fetchone()[0],3)
 def test_audit_immutable(self):
  self.db.execute("INSERT INTO audit_logs VALUES('audit','faculty','FACULTY','Reviewed','attendance','attendance','{}','{}','Verified','2026-01-01')")
  for query in ['UPDATE audit_logs SET reason=\'other\'','DELETE FROM audit_logs','DELETE FROM attendance']:
   with self.assertRaises(sqlite3.IntegrityError):self.db.execute(query)
 def test_photo_limits(self):
  for i in range(10):self.db.execute("INSERT INTO evidence VALUES(?, 'attendance', ?, 'image/png', '{}', NULL,'PENDING','','2026-01-01')",(str(i),str(i)))
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("INSERT INTO evidence VALUES('extra','attendance','extra','image/png','{}',NULL,'PENDING','','2026-01-01')")
 def test_cancelled_attendance_rejects_photo(self):
  self.db.execute("UPDATE attendance SET status='CANCELLED'")
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("INSERT INTO evidence VALUES('p','attendance','p','image/png','{}',NULL,'PENDING','','2026-01-01')")
 def test_no_sample_columns(self):
  for table in ['users','events']:self.assertNotIn('sample',[r[1] for r in self.db.execute(f'PRAGMA table_info({table})')])
if __name__=='__main__':unittest.main()
