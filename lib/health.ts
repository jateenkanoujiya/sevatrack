import {databaseClient} from './db';
import {AppError} from './errors';
import migrations from '@/database/migration-manifest.json';

export async function systemHealth(user:{role:string}){
 if(user.role!=='ADMIN')throw new AppError('System checks are restricted to administrators.',403);
 const tx=await databaseClient().transaction('read');
 try{
  const checks:{label:string;ok:boolean}[]=[];
  const applied=(await tx.execute('SELECT name,checksum FROM seva_migrations')).rows;
  checks.push({label:'Database migrations match this release',ok:migrations.every(m=>applied.some(row=>row.name===m.name&&row.checksum===m.checksum))});
  checks.push({label:'Database references are intact',ok:!(await tx.execute('PRAGMA foreign_key_check')).rows.length});
  const queries=[
   ['Active administrator available',"SELECT COUNT(*) n FROM users WHERE role='ADMIN' AND active=1",true],
   ['Attendance hours agree with approval status',"SELECT COUNT(*) n FROM (SELECT a.id,a.status,COALESCE(SUM(l.delta),0) total FROM attendance a LEFT JOIN hour_ledger l ON l.attendance_id=a.id GROUP BY a.id HAVING total < -0.005 OR total > 24.005 OR (a.status NOT IN ('APPROVED','PARTIAL') AND ABS(total)>0.005))",false],
   ['Ledger credits belong to the correct student and year',"SELECT COUNT(*) n FROM hour_ledger l JOIN attendance a ON a.id=l.attendance_id WHERE l.user_id!=a.user_id OR l.year!=a.year",false],
   ['Historical hour balances agree with the ledger',"SELECT COUNT(*) n FROM historical_hours h WHERE ABS(h.balance-(SELECT SUM(x.delta) FROM historical_hours x WHERE x.user_id=h.user_id AND x.year=h.year AND x.revision<=h.revision))>0.005",false],
   ['Past event balances agree with the ledger',"SELECT COUNT(*) n FROM past_event_hours h WHERE ABS(h.balance-(SELECT SUM(x.delta) FROM past_event_hours x WHERE x.event_id=h.event_id AND x.user_id=h.user_id AND x.revision<=h.revision))>0.005",false],
   ['No failed account photo cleanup jobs',"SELECT COUNT(*) n FROM deletion_blob_jobs WHERE status='FAILED'",false],
  ] as const;
  for(const [label,query,positive] of queries){const n=Number((await tx.execute(query)).rows[0].n);checks.push({label,ok:positive?n>0:n===0})}
  return {release:'2026-11-launch-guards',checkedAt:new Date().toISOString(),ok:checks.every(c=>c.ok),checks,scope:'Read-only database checks. A real phone GPS test, live photo upload and backup restoration are separate checks.'};
 }finally{await tx.rollback()}
}
