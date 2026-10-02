import {del,list} from '@vercel/blob';
import {all,one,sql,id,now} from './db';
import {passwordHash,constantEqual,rate} from './auth';
import {AppError} from './errors';

function admin(u:any){if(u.role!=='ADMIN'||!u.active)throw new AppError('Only active administrators can delete accounts.',403);}
export async function deletionSummary(u:any,targetId:string){
 admin(u);
 const target=await one("SELECT id,name,email,role FROM users WHERE id=? AND role IN ('ADMIN','FACULTY','STUDENT')",targetId);
 if(!target)throw new AppError('Account not found.',404);
 if(target.id===u.id)throw new AppError('You cannot delete your own account.',409);
 const counts=await one(`SELECT
 (SELECT COUNT(*) FROM attendance WHERE user_id=?) attendance,
 (SELECT COUNT(*) FROM evidence e JOIN attendance a ON a.id=e.attendance_id WHERE a.user_id=?) photos,
 (SELECT COALESCE(SUM(delta),0) FROM hour_ledger WHERE user_id=?) hours,
 (SELECT COUNT(*) FROM events WHERE coordinator=?) events`,targetId,targetId,targetId,targetId);
 return {target,counts};
}
export async function deleteAccount(u:any,b:any){
 admin(u);await rate('delete-account-'+u.id,5);
 if(typeof b.id!=='string'||typeof b.email!=='string'||typeof b.password!=='string'||typeof b.reason!=='string'||b.reason.trim().length<1||b.reason.length>1000||b.password.length>128)throw new AppError('Enter the account email, your password and a deletion reason.');
 const current=await one("SELECT * FROM users WHERE id=? AND role='ADMIN' AND active=1",u.id);
 if(!current?.password||!constantEqual(await passwordHash(b.password,current.password.split(':')[0]),current.password))throw new AppError('Your administrator password is incorrect.',403);
 const summary=await deletionSummary(current,b.id);
 if(b.email.trim().toLowerCase()!==summary.target.email.toLowerCase())throw new AppError('Type the exact email of the account being deleted.');
 await sql('INSERT INTO account_deletions(id,target,actor,confirmed_email,actor_password_hash,reason,created_at) VALUES (?,?,?,?,?,?,?)',id(),b.id,u.id,b.email.trim(),current.password,b.reason.trim(),now()).run();
 // Physical Blob removal is retriable and never part of the SQL transaction.
 return {message:'Account and its database history deleted. Photo cleanup is queued; use Retry photo cleanup in Accounts. A final sweep is available after 20 minutes.'};
}
export async function cleanupDeletedPhotos(u:any){
 admin(u);await rate('delete-cleanup-'+u.id,20);
 const jobs=await all('SELECT * FROM deletion_blob_jobs ORDER BY updated_at LIMIT 5');
 let completed=0,failed=0;
 for(const job of jobs){
  try{
   if(!/^evidence\/[^/]+\/$/.test(job.prefix))throw new Error('Invalid cleanup prefix');
   // Bounded work per call. Re-list from the start on retries; only this deleted
   // account's server-generated prefix is ever accepted, never request paths.
   let empty=false;
   for(let page=0;page<3;page++){
    const result=await list({prefix:job.prefix,limit:100});
    if(!result.blobs.length){empty=true;break;}
    if(result.blobs.some((blob:{pathname:string})=>!blob.pathname.startsWith(job.prefix)))throw new Error('Unexpected photo path');
    await del(result.blobs.map((blob:{pathname:string})=>blob.pathname));
   }
   if(empty&&Date.parse(job.not_before)<=Date.now()){
    await sql('DELETE FROM deletion_blob_jobs WHERE id=?',job.id).run();completed++;
   }else await sql("UPDATE deletion_blob_jobs SET status='PENDING',attempts=attempts+1,updated_at=? WHERE id=?",now(),job.id).run();
  }catch{
   failed++;await sql("UPDATE deletion_blob_jobs SET status='FAILED',attempts=attempts+1,updated_at=? WHERE id=?",now(),job.id).run();
  }
 }
 const pending=Number((await one('SELECT COUNT(*) n FROM deletion_blob_jobs')).n);
 return {message:failed?`Photo cleanup could not finish for ${failed} account(s). Check Blob configuration, then retry. Database deletion is complete.`:pending?`${completed} photo cleanup job(s) completed; ${pending} pending. Retry after the 20-minute upload grace period or to process more photos.`:'All queued photo cleanup completed.',pending,failed};
}
