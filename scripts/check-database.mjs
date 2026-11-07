import {createClient} from '@libsql/client';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const url=process.env.TURSO_DATABASE_URL;
if(!url)throw new Error('Set TURSO_DATABASE_URL in your private environment.');
const db=createClient({url,authToken:process.env.TURSO_AUTH_TOKEN});
let tx;
try {
 tx=await db.transaction('read');
 let failures=0;
 const check=(ok,label)=>{console.log(`${ok?'PASS':'FAIL'} ${label}`);if(!ok)failures++};
 const fk=await tx.execute('PRAGMA foreign_key_check');check(!fk.rows.length,'Foreign-key integrity');
 const integrity=await tx.execute('PRAGMA integrity_check');check(integrity.rows.every(r=>r[0]==='ok'),'Database integrity');
 for(const name of (await readdir(new URL('../database/migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort()){
  const hash=createHash('sha256').update(await readFile(new URL('../database/migrations/'+name,import.meta.url))).digest('hex');
  const result=await tx.execute({sql:'SELECT checksum FROM seva_migrations WHERE name=?',args:[name]});
  check(result.rows[0]?.checksum===hash,`Applied migration ${name}`);
 }
 const queries=[
  ['Active administrator',"SELECT COUNT(*) n FROM users WHERE role IN ('SUPER_ADMIN','ADMIN') AND active=1",n=>n>0],
  ['Program settings',"SELECT COUNT(*) n FROM settings WHERE id='program' AND json_valid(value)",n=>n===1],
  ['Ledger identity',"SELECT COUNT(*) n FROM hour_ledger l JOIN attendance a ON a.id=l.attendance_id WHERE l.user_id!=a.user_id OR l.year!=a.year",n=>n===0],
  ['Attendance hour balances',"SELECT COUNT(*) n FROM (SELECT a.id,a.status,COALESCE(SUM(l.delta),0) total FROM attendance a LEFT JOIN hour_ledger l ON l.attendance_id=a.id GROUP BY a.id HAVING total < -0.005 OR total > 24.005 OR (a.status NOT IN ('APPROVED','PARTIAL') AND ABS(total)>0.005))",n=>n===0],
  ['Historical hour balances',"SELECT COUNT(*) n FROM historical_hours h WHERE ABS(h.balance-(SELECT SUM(x.delta) FROM historical_hours x WHERE x.user_id=h.user_id AND x.year=h.year AND x.revision<=h.revision))>0.005",n=>n===0],
  ['Past event balances',"SELECT COUNT(*) n FROM past_event_hours h WHERE ABS(h.balance-(SELECT SUM(x.delta) FROM past_event_hours x WHERE x.event_id=h.event_id AND x.user_id=h.user_id AND x.revision<=h.revision))>0.005",n=>n===0],
  ['Service credit totals',"SELECT ABS((SELECT COALESCE(SUM(delta),0) FROM service_credits)-(SELECT COALESCE(SUM(delta),0) FROM hour_ledger)-(SELECT COALESCE(SUM(delta),0) FROM historical_hours)-(SELECT COALESCE(SUM(delta),0) FROM past_event_hours)) n",n=>n<0.005]
 ];
 for(const [label,query,valid] of queries){const result=await tx.execute(query);check(valid(Number(result.rows[0].n)),label)}
 await tx.rollback();tx=null;
 if(failures)process.exitCode=1;
 console.log('Read-only check complete. No records changed; no personal data printed.');
} finally {if(tx)await tx.rollback();db.close()}
