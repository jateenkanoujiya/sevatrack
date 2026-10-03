"""Directory deletion never cascades into student/event/history records."""
import sqlite3,json
from pathlib import Path
c=sqlite3.connect(':memory:');c.execute('PRAGMA foreign_keys=ON')
for f in sorted(Path('database/migrations').glob('*.sql')):
 for s in f.read_text().split('--> statement-breakpoint'):
  if s.strip():c.execute(s)
c.execute("INSERT INTO users(id,email,name,role,department,created_at) VALUES('admin','a@example.test','Admin','ADMIN','Science','2026-10-03'),('student','s@example.test','Student','STUDENT','Science','2026-10-03')")
c.execute("INSERT INTO events(id,title,category,description,start,end,deadline,hours,location,lat,lng,radius,capacity,coordinator,status,created_at) VALUES('event','Service','Old category','Test','2026-10-03','2026-10-04','2026-10-02',4,'Campus',19,72,100,20,'admin','Completed','2026-10-03')")
c.execute("INSERT INTO attendance(id,event_id,user_id,year,status,created_at) VALUES('attendance','event','student',1,'REGISTERED','2026-10-03')")
c.execute("INSERT INTO settings VALUES('program',?)",(json.dumps(dict(academicStart='2026-07-01',academicEnd='2027-06-30')),))
for kind,name in [('department','Science'),('academic_year','2026–2027'),('category','Old category')]:
 c.execute('INSERT INTO catalogs VALUES(?,?,?,?)',(kind,kind,name,'{}'))
 with c:
  c.execute("INSERT INTO audit_logs (id,actor,role,action,entity,entity_id,old_value,new_value,reason,created_at) SELECT ?,'admin','ADMIN','Directory entry deleted','catalogs',id,json_object('name',name),'null','No longer offered','2026-10-03' FROM catalogs WHERE id=? AND kind=?",(kind,kind,kind))
  c.execute('DELETE FROM catalogs WHERE id=? AND kind=?',(kind,kind))
 assert c.execute('SELECT COUNT(*) FROM catalogs WHERE id=?',(kind,)).fetchone()[0]==0
assert c.execute("SELECT department FROM users WHERE id='student'").fetchone()[0]=='Science'
assert c.execute('SELECT category FROM events').fetchone()[0]=='Old category'
assert c.execute('SELECT COUNT(*) FROM attendance').fetchone()[0]==1
assert c.execute('SELECT COUNT(*) FROM audit_logs').fetchone()[0]==3
assert json.loads(c.execute('SELECT value FROM settings').fetchone()[0])['academicStart']=='2026-07-01'
print('Directory deletion preserves account/event labels, attendance, configured dates and audited deletions.')
