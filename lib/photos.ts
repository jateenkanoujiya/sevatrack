import {get,del} from '@vercel/blob';
import {one,sql,insert,db,id,now,audit} from './db';
import {AppError,boundedBody} from './errors';
import {verifiedAttendanceGPS} from './domain';
import {photoMetadata} from './photo-metadata';
import {validateImage} from './uploads';
const MAX=5*1024*1024;
export async function photoAttendance(u:any,aid:string){
 const row=await one('SELECT a.*,e.coordinator,e.lat,e.lng,e.radius,e.status event_status FROM attendance a JOIN events e ON e.id=a.event_id WHERE a.id=?',aid);
 if(!row||(u.role==='STUDENT'&&row.user_id!==u.id)||(u.role==='FACULTY'&&row.coordinator!==u.id))throw new AppError('Attendance not found in your authorized scope.',403);
 if(row.event_status==='Cancelled'||['REGISTERED','CANCELLED','REJECTED','ABSENT'].includes(row.status))throw new AppError('This attendance no longer accepts proof. Contact your coordinator.');
 if(!row.original_in||!verifiedAttendanceGPS(row.location_in,row))throw new AppError('Verify your GPS check-in at the event before submitting photo proof.');
 return row;
}
export async function preparePhoto(u:any,b:any){
 if(!['image/jpeg','image/png','image/webp'].includes(b.mime)||!Number.isInteger(b.size)||b.size<=0||b.size>MAX)throw new AppError('Choose a JPG, PNG or WebP photo under 5 MB.');
 const a=await photoAttendance(u,String(b.attendance));
 if((await one('SELECT COUNT(*) n FROM evidence WHERE attendance_id=?',a.id)).n>=10)throw new AppError('This activity already has 10 photos. Contact your coordinator.');
 if((await one('SELECT COUNT(*) n FROM upload_intents WHERE user_id=? AND expires>?',u.id,now())).n>=15)throw new AppError('Too many unfinished uploads. Please wait 15 minutes and try again.',429);
 const pid=id(),path=`evidence/${a.user_id}/${pid}`;
 await insert('upload_intents',{id:pid,user_id:u.id,attendance_id:a.id,path,mime:b.mime,size:b.size,location:JSON.stringify(photoMetadata(b,a)),expires:new Date(Date.now()+900000).toISOString(),created_at:now()}).run();
 return {id:pid,path};
}
export async function authorizePhoto(u:any,pid:string,path:string){
 const ticket=await one('SELECT * FROM upload_intents WHERE id=? AND user_id=? AND path=? AND expires>?',pid,u.id,path,now());
 if(!ticket)throw new AppError('This upload expired. Choose the photo and try again.',403);
 await photoAttendance(u,ticket.attendance_id);
 return ticket;
}
export async function finishPhoto(u:any,pid:string){
 const ticket=await one('SELECT * FROM upload_intents WHERE id=? AND user_id=? AND expires>?',pid,u.id,now());
 if(!ticket){const existing=await one('SELECT e.* FROM evidence e JOIN audit_logs a ON a.entity_id=e.id AND a.entity=? AND a.actor=? WHERE e.id=?','evidence',u.id,pid);if(existing){await photoAttendance(u,existing.attendance_id);return {message:'Photo submitted for review.'};}throw new AppError('This upload expired. Please submit the photo again.');}
 const a=await photoAttendance(u,ticket.attendance_id);
 // Only use the server-owned path, never a submitted URL or pathname.
 const blob=await get(ticket.path,{access:'private',useCache:false});
 if(!blob||blob.statusCode!==200)throw new AppError('The photo has not finished uploading. Please try again.');
 try{
  if(blob.blob.size!==ticket.size||blob.blob.contentType!==ticket.mime)throw new AppError('The uploaded file does not match the selected photo.');
  const bytes=await boundedBody(new Response(blob.stream) as unknown as Request,MAX);
  validateImage(bytes.buffer as ArrayBuffer,ticket.mime);
 }catch(error){await del(ticket.path);if(error instanceof AppError)throw error;throw new AppError('This photo is unreadable. Choose another photo.');}
 try{await db().batch([
  insert('evidence',{id:pid,attendance_id:a.id,key:ticket.path,mime:ticket.mime,location:ticket.location,captured_at:null,status:'PENDING',remarks:'',created_at:now()}),
  sql("UPDATE attendance SET status=CASE WHEN status IN ('CHECKED_OUT','EVIDENCE_PENDING') THEN 'PENDING_REVIEW' ELSE status END WHERE id=?",a.id),
  sql("INSERT INTO notifications (id,user_id,title,body,read,created_at) SELECT lower(hex(randomblob(16))),id,'Photo evidence submitted',?,0,? FROM users WHERE role='ADMIN' AND active=1 AND EXISTS(SELECT 1 FROM attendance WHERE id=? AND original_out IS NOT NULL)",'Attendance photo ready for GPS and evidence review.',now(),a.id),
  audit(u,'Photo submitted','evidence',pid,null,{attendance:a.id},'Participation evidence'),
  sql('DELETE FROM upload_intents WHERE id=?',pid)
 ]);}catch(error){if(!await one('SELECT id FROM evidence WHERE id=? AND attendance_id=?',pid,a.id))throw error;}
 return {message:'Photo submitted for review.'};
}
