"""Restore a trusted SevaTrack snapshot into a NEW local SQLite file only."""
import json,sqlite3,sys,base64,os
from pathlib import Path
if len(sys.argv)!=3: raise SystemExit('Usage: python scripts/restore-backup.py backups/snapshot.json backups/rehearsal.db')
source,target=map(Path,sys.argv[1:]);data=json.loads(source.read_text())
if data.get('format')!='sevatrack-backup-v1':raise SystemExit('Unsupported snapshot format')
# Exclusive creation prevents accidental replacement of any existing database.
fd=os.open(target,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600);os.close(fd)
def quote(s):return '"'+s.replace('"','""')+'"'
def decode(v):
 if isinstance(v,dict):
  if '$integer' in v:return int(v['$integer'])
  if '$blob' in v:return base64.b64decode(v['$blob'],validate=True)
  raise ValueError('Invalid backup value')
 return v
try:
 db=sqlite3.connect(target)
 db.execute('BEGIN')
 for item in data['schema']:
  if item['type']=='table':db.execute(item['sql'])
 # Load before creating immutable-ledger triggers; never disable source guards.
 for table in data['tables']:
  statement='INSERT INTO '+quote(table['name'])+' ('+','.join(map(quote,table['columns']))+') VALUES ('+','.join('?' for _ in table['columns'])+')'
  db.executemany(statement,[[decode(v) for v in row] for row in table['rows']])
 for kind in ('index','view','trigger'):
  for item in data['schema']:
   if item['type']==kind:db.execute(item['sql'])
 if db.execute('PRAGMA foreign_key_check').fetchall():raise ValueError('Foreign-key check failed')
 if db.execute('PRAGMA integrity_check').fetchall()!=[('ok',)]:raise ValueError('Integrity check failed')
 db.commit();db.close()
 print('Restored and verified a new LOCAL database. Production was not changed.')
except BaseException:
 db.close();target.unlink(missing_ok=True);raise
