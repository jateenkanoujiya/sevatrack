import sqlite3,unittest,json
from pathlib import Path
class GPSWorkflow(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:');self.db.execute('PRAGMA foreign_keys=ON')
  for f in sorted(Path('database/migrations').glob('*.sql')):
   for stmt in f.read_text().split('--> statement-breakpoint'):
    if stmt.strip():self.db.execute(stmt)
  for uid,role in [('admin','ADMIN'),('faculty','FACULTY'),('student','STUDENT')]:
   self.db.execute('INSERT INTO users(id,email,name,role,created_at) VALUES(?,?,?,?,?)',(uid,uid+'@example.test',uid,role,'2026-10-03'))
  self.db.execute("INSERT INTO events(id,title,category,description,start,end,deadline,hours,location,lat,lng,radius,capacity,coordinator,status,created_at) VALUES('e','Test','Service','Test','2026-10-03','2026-10-04','2026-10-03',4,'Campus',19,72,100,20,'faculty','Ongoing','2026-10-03')")
  self.db.execute("INSERT INTO attendance(id,event_id,user_id,year,status,original_in,original_out,effective_in,effective_out,created_at) VALUES('a','e','student',1,'PENDING_REVIEW','2026-10-03T10:00:00Z','2026-10-03T14:00:00Z','2026-10-03T10:00:00Z','2026-10-03T14:00:00Z','2026-10-03')")
  self.db.commit()
 def tearDown(self):self.db.close()
 def gps(self):
  loc=json.dumps(dict(lat=19,lng=72,accuracy=8,inside=True,status='Location verified'))
  self.db.execute('UPDATE attendance SET location_in=?,location_out=?',(loc,loc))
 def photo(self,status='APPROVED'):
  self.db.execute("INSERT INTO evidence VALUES('p','a','private/test','image/png','{}',NULL,?,'','2026-10-03')",(status,))
 def credit(self,actor='admin'):
  self.db.execute("INSERT INTO hour_ledger VALUES('l','a','student',1,4,'Verified',?,0,'2026-10-03')",(actor,))
 def test_missing_gps_blocks_approval(self):
  self.photo()
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE attendance SET status='APPROVED'")
 def test_missing_photo_blocks_approval(self):
  self.gps()
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE attendance SET status='APPROVED'")
 def test_pending_photo_blocks_approval(self):
  self.gps();self.photo('PENDING')
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE attendance SET status='APPROVED'")
 def test_pending_attendance_cannot_earn_hours(self):
  self.gps();self.photo()
  with self.assertRaises(sqlite3.IntegrityError):self.credit()
 def test_faculty_cannot_credit_hours(self):
  self.gps();self.photo();self.db.execute("UPDATE attendance SET status='APPROVED'")
  with self.assertRaises(sqlite3.IntegrityError):self.credit('faculty')
 def test_admin_credits_only_after_complete_chain(self):
  self.gps();self.photo();self.db.execute("UPDATE attendance SET status='APPROVED'");self.credit()
  self.assertEqual(self.db.execute('SELECT SUM(delta) FROM service_credits').fetchone()[0],4)
 def test_gps_immutable(self):
  self.gps()
  for name in ['location_in','location_out']:
   with self.assertRaises(sqlite3.IntegrityError):self.db.execute(f'UPDATE attendance SET {name}=NULL')
 def test_cannot_reject_supporting_evidence(self):
  self.gps();self.photo();self.db.execute("UPDATE attendance SET status='APPROVED'");self.credit()
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE evidence SET status='REJECTED'")
 def test_failed_credit_rolls_back_approval(self):
  self.gps();self.photo();self.db.commit()
  try:
   with self.db:
    self.db.execute("UPDATE attendance SET status='APPROVED'");self.credit('faculty')
  except sqlite3.IntegrityError:pass
  self.assertEqual(self.db.execute('SELECT status FROM attendance').fetchone()[0],'PENDING_REVIEW')
if __name__=='__main__':unittest.main()
