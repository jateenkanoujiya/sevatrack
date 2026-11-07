import {all,one,db,sql,insert,id,now,audit,notice} from './db';
import {AppError} from './errors';
function admin(u:any){if(!['SUPER_ADMIN','ADMIN'].includes(u.role)||!u.active)throw new AppError('Only an active administrator may record past events or change their hours.',403)}
function text(v:any,label:string,max=500){if(typeof v!=='string'||!v.trim()||v.trim().length>max)throw new AppError(`${label} is required (maximum ${max} characters).`);return v.trim()}
function number(v:any,label:string,min:number,max:number){const n=Number(v);if(v===null||v===undefined||typeof v==='boolean'||String(v).trim()===''||!Number.isFinite(n)||n<min||n>max||Math.abs(n*100-Math.round(n*100))>0.000001)throw new AppError(`${label} must be ${min}–${max}, with up to 2 decimals.`);return n}
export async function pastEvent(u:any,eventId:string){
 const e=await one('SELECT e.*,u.name coordinator_name FROM past_events e JOIN users u ON u.id=e.coordinator WHERE e.id=?',eventId);
 if(!e)throw new AppError('Past event not found.',404);
 if(u.role==='FACULTY'&&e.coordinator!==u.id||['STUDENT','VOLUNTEER'].includes(u.role)&&!await one('SELECT id FROM past_event_hours WHERE event_id=? AND user_id=?',eventId,u.id))throw new AppError('This past event is restricted.',403);
 return e;
}
export async function pastEvents(u:any,p:URLSearchParams){
 const query=(p.get('q')||'').slice(0,150),page=Math.max(1,Math.floor(Number(p.get('page'))||1)),size=25;
 const scope=['STUDENT','VOLUNTEER'].includes(u.role)?'EXISTS(SELECT 1 FROM past_event_hours h WHERE h.event_id=e.id AND h.user_id=?)':u.role==='FACULTY'?'e.coordinator=?':'1=1';
 const args:any[]=['SUPER_ADMIN','ADMIN'].includes(u.role)?[]:[u.id];let where=scope;
 if(query){where+=' AND (e.title LIKE ? OR e.location LIKE ? OR e.category LIKE ?)';args.push(...Array(3).fill('%'+query+'%'))}
 const count=await one(`SELECT COUNT(*) total FROM past_events e WHERE ${where}`,...args),pages=Math.max(1,Math.ceil(count.total/size)),current=Math.min(page,pages);
 const rows=await all(`SELECT e.* FROM past_events e WHERE ${where} ORDER BY e.start DESC,e.id LIMIT ? OFFSET ?`,...args,size,(current-1)*size);
 return {rows,page:current,pages,total:count.total};
}
export async function pastDetail(u:any,eventId:string){
 const event=await pastEvent(u,eventId),scope=['STUDENT','VOLUNTEER'].includes(u.role)?' AND h.user_id=?':'',args=['STUDENT','VOLUNTEER'].includes(u.role)?[eventId,u.id]:[eventId];
 const participants=await all(`SELECT h.user_id,h.year,ROUND(SUM(h.delta),2) hours,MAX(h.revision) revision,u.name,u.nss_id FROM past_event_hours h JOIN users u ON u.id=h.user_id WHERE h.event_id=?${scope} GROUP BY h.user_id,h.year ORDER BY u.name`,...args);
 const history=await all(`SELECT h.*,u.name student_name,a.name actor_name FROM past_event_hours h JOIN users u ON u.id=h.user_id LEFT JOIN users a ON a.id=h.actor WHERE h.event_id=?${scope} ORDER BY h.created_at DESC,h.revision DESC LIMIT 100`,...args);
 return {event,participants,history};
}
export async function savePastEvent(u:any,b:any){
 admin(u);const reason=text(b.reason,'Reason',1000);
 const start=Date.parse(b.start),end=Date.parse(b.end);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end>Date.now()||end-start>86400000)throw new AppError('Use an event that has already ended, with a positive duration of up to 24 hours. Split multi-day camps into daily records.');
 const data={title:text(b.title,'Event title',150),category:text(b.category,'Category',150),description:text(b.description,'Description',3000),start:new Date(start).toISOString(),end:new Date(end).toISOString(),location:text(b.location,'Location',300),hours:number(b.hours,'Maximum service hours',0.01,24),source:text(b.source,'Supporting register / logbook reference'),coordinator:text(b.coordinator,'Coordinator',100)};
 if(!await one("SELECT id FROM catalogs WHERE kind='category' AND name=?",data.category))throw new AppError('Choose an existing event category.');
 if(!await one("SELECT id FROM users WHERE id=? AND role IN ('SUPER_ADMIN','ADMIN','FACULTY') AND active=1",data.coordinator))throw new AppError('Choose an active coordinator.');
 const existing=b.id?await pastEvent(u,b.id):null,eventId=existing?.id||id();
 if(await one('SELECT id FROM past_events WHERE lower(trim(title))=lower(?) AND start=? AND lower(trim(location))=lower(?) AND id!=?',data.title,data.start,data.location,eventId)||await one('SELECT id FROM events WHERE lower(trim(title))=lower(?) AND start=? AND lower(trim(location))=lower(?)',data.title,data.start,data.location))throw new AppError('An event with this title, start time and location already exists. Use its existing record.',409);
 if(existing&&(!Number.isInteger(b.revision)||b.revision!==existing.revision))throw new AppError('Event changed. Reload before editing.',409);
 const write=existing?sql(`UPDATE past_events SET ${Object.keys(data).map(k=>k+'=?').join(',')},revision=CASE WHEN revision=? THEN revision+1 ELSE -1 END WHERE id=?`,...Object.values(data),existing.revision,eventId):insert('past_events',{id:eventId,...data,revision:0,created_at:now()});
 await db().batch([write,audit(u,existing?'Past event edited':'Past event created','past_event',eventId,existing,data,reason)]);
 return {id:eventId,message:'Past event saved. Add verified student hours from the supporting register.'};
}
export async function savePastHours(u:any,b:any){
 admin(u);const e=await pastEvent(u,b.event);
 if(b.confirmNotCounted!==true)throw new AppError('Confirm these hours are not already included in attendance or historical opening balances.');
 const reason=text(b.reason,'Reason',1000),source=text(b.source,'Supporting register / logbook reference');
 if(!Array.isArray(b.rows)||!b.rows.length||b.rows.length>100)throw new AppError('Select 1–100 students per save.');
 const nssIds=b.rows.map((r:any)=>text(r.nss_id,'NSS ID',100));
 const balances=await all(`SELECT u.id,u.name,u.nss_id,ROUND(COALESCE(SUM(h.delta),0),2) hours,COALESCE(MAX(h.revision),0) revision,MIN(h.year) year FROM users u LEFT JOIN past_event_hours h ON h.user_id=u.id AND h.event_id=? WHERE u.role IN ('STUDENT','VOLUNTEER') AND u.nss_id IN (${nssIds.map(()=>'?').join(',')}) GROUP BY u.id`,e.id,...nssIds);
 const lookup=new Map(balances.map(r=>[r.nss_id,r]));
 const seen=new Set(),changes=[];
 for(const row of b.rows){
  const nss=text(row.nss_id,'NSS ID',100),hours=number(row.hours,'Approved hours',0,e.hours),year=number(row.year,'NSS year',1,2),revision=number(row.revision,'Revision',0,1000000);
  if(!Number.isInteger(year)||!Number.isInteger(revision))throw new AppError('Use NSS Year 1 or 2 and a whole revision.');
  if(seen.has(nss))throw new AppError('Each student can appear only once per event.');seen.add(nss);
  const student=lookup.get(nss);if(!student)throw new AppError(`No student matches NSS ID ${nss}.`);
  const old=student;
  if(old.revision!==revision)throw new AppError(`Hours for ${nss} changed. Reload and try again.`,409);
  if(old.year&&old.year!==year)throw new AppError(`NSS year for ${nss} is already recorded as Year ${old.year}.`);
  if(hours===Number(old.hours))continue;
  const delta=Math.round((hours-old.hours)*100)/100;
  changes.push(insert('past_event_hours',{id:id(),event_id:e.id,user_id:student.id,year,delta,balance:hours,revision:revision+1,source,reason,actor:u.id,created_at:now()}),audit(u,'Past event hours recorded','users',student.id,{event:e.id,year,hours:old.hours,revision},{event:e.id,title:e.title,year,hours,delta,source,revision:revision+1},reason),notice(student.id,'Past event hours updated',`${e.title}: ${hours} approved NSS hours in Year ${year}. ${reason}`));
 }
 if(changes.length)await db().batch(changes);
 return {message:`${changes.length/3} student balance(s) updated. Hours are included in NSS progress and activity history.`};
}
