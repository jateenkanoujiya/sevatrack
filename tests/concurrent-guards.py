import sqlite3,unittest
from pathlib import Path

class Guards(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:')
  for file in sorted(Path('database/migrations').glob('*.sql')):
   for query in file.read_text().split('--> statement-breakpoint'):
    if query.strip():self.db.execute(query)
  self.db.execute("INSERT INTO users(id,email,name,role,password,created_at) VALUES('u','u@example.test','User','STUDENT','original','2026-01-01')")
  self.db.execute("INSERT INTO resets VALUES('r','u','token','2999-01-01','ISSUED','2026-01-01')")
  self.db.commit()
 def tearDown(self):self.db.close()
 def test_reset_reuse_rolls_back_password_change(self):
  with self.db:
   self.db.execute("UPDATE users SET password='first' WHERE id='u'")
   self.db.execute("UPDATE resets SET status='USED',token=NULL WHERE id='r'")
  with self.assertRaises(sqlite3.IntegrityError):
   with self.db:
    self.db.execute("UPDATE users SET password='replayed' WHERE id='u'")
    self.db.execute("UPDATE resets SET status='USED',token=NULL WHERE id='r'")
  self.assertEqual(self.db.execute("SELECT password FROM users WHERE id='u'").fetchone()[0],'first')
 def test_expired_reset_rolls_back(self):
  self.db.execute("UPDATE resets SET expires='2000-01-01'");self.db.commit()
  with self.assertRaises(sqlite3.IntegrityError):
   with self.db:
    self.db.execute("UPDATE users SET password='expired' WHERE id='u'")
    self.db.execute("UPDATE resets SET status='USED' WHERE id='r'")
  self.assertEqual(self.db.execute("SELECT password FROM users WHERE id='u'").fetchone()[0],'original')
 def test_photo_insert_without_eligible_attendance(self):
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("INSERT INTO evidence VALUES('p','missing','evidence/u/p','image/png','{}',NULL,'PENDING','','2026-01-01')")

if __name__=='__main__':unittest.main()
