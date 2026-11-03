"""Staff-only cleanup and database guards; isolated SQLite, no live database."""
import sqlite3, unittest
from pathlib import Path

class StaffProfiles(unittest.TestCase):
 def test_cleanup_and_future_writes(self):
  db=sqlite3.connect(':memory:');db.execute('PRAGMA foreign_keys=ON')
  files=sorted(Path('database/migrations').glob('*.sql'))
  def apply(f):
   for sql in f.read_text().split('--> statement-breakpoint'):
    if sql.strip(): db.execute(sql)
  for f in files:
   if f.name<'010': apply(f)
  for role in ['ADMIN','FACULTY','STUDENT','VOLUNTEER']:
   db.execute("INSERT INTO users(id,email,name,role,batch,year,roll,nss_id,password,created_at) VALUES(?,?,?,?,?,2,?,?,?,?)",(role,role+'@example.test',role,role,'2026–2028','R-'+role,'N-'+role,'unchanged-password','2026-01-01'))
  before={r:db.execute('SELECT * FROM users WHERE id=?',(r,)).fetchone() for r in ['STUDENT','VOLUNTEER']}
  apply(files[-1])
  for role in ['ADMIN','FACULTY']:
   self.assertEqual(db.execute('SELECT batch,year,roll,nss_id,password FROM users WHERE id=?',(role,)).fetchone(),('',0,'',None,'unchanged-password'))
   self.assertEqual(db.execute("SELECT COUNT(*) FROM audit_logs WHERE entity_id=? AND action='Staff profile fields cleared'",(role,)).fetchone()[0],1)
  for role,record in before.items(): self.assertEqual(db.execute('SELECT * FROM users WHERE id=?',(role,)).fetchone(),record)
  db.execute("UPDATE users SET batch='stale',year=1,roll='stale' WHERE id='FACULTY'")
  self.assertEqual(db.execute("SELECT batch,year,roll FROM users WHERE id='FACULTY'").fetchone(),('',0,''))
  db.execute("INSERT INTO users(id,email,name,role,created_at) VALUES('bootstrap','bootstrap@example.test','Bootstrap','ADMIN','2026-01-01')")
  self.assertEqual(db.execute("SELECT batch,year,roll FROM users WHERE id='bootstrap'").fetchone(),('',0,''))
  self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
  db.close()

if __name__=='__main__': unittest.main()
