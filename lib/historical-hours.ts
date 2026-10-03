import {all,one,db,insert,id,now,audit,notice} from './db';
import {AppError} from './errors';
export const HISTORICAL_DEADLINE='2026-10-07T18:30:00.000Z';
export function canEditHistorical(u:any,time=Date.now()){
 return !!u.active&&(u.role==='ADMIN'||u.role==='FACULTY'&&time<Date.parse(HISTORICAL_DEADLINE));
}
function text(v:any,label:string,max:number){if(typeof v!=='string'||!v.trim()||v.trim().length>max)throw new AppError(`${label} is required (maximum ${max} characters).`);return v.trim();}
export async function historicalBalances(u:any,student:string){
 if(u.role==='STUDENT'&&u.id!==student)throw new AppError('This student record is restricted.',403);
 if(!['STUDENT','FACULTY','ADMIN'].includes(u.role))throw new AppError('Access denied.',403);
 if(!await one("SELECT id FROM users WHERE id=? AND role='STUDENT'",student))throw new AppError('Student not found.',404);
 return {canEdit:canEditHistorical(u),deadline:HISTORICAL_DEADLINE,rows:await all('SELECT h.*,u.name actor_name FROM historical_hours h LEFT JOIN users u ON u.id=h.actor WHERE h.user_id=? ORDER BY h.revision DESC,h.year',student)};
}
export async function saveHistorical(u:any,b:any){
 if(!canEditHistorical(u))throw new AppError('Historical entry closed after 7 October 2026 (India). Ask an administrator for a correction.',403);
 const reason=text(b.reason,'Reason',1000),source=text(b.source,'Supporting logbook or record reference',500);
 if(!Array.isArray(b.rows)||!b.rows.length||b.rows.length>200)throw new AppError('Submit 1–200 student/year balances.');
 const ids=b.rows.map((row:any)=>text(row.nss_id,'NSS ID',100));
 const balances=await all(`SELECT u.id,u.nss_id,y.year,ROUND(COALESCE(SUM(h.delta),0),2) hours,COALESCE(MAX(h.revision),0) revision FROM users u CROSS JOIN (SELECT 1 year UNION ALL SELECT 2) y LEFT JOIN historical_hours h ON h.user_id=u.id AND h.year=y.year WHERE u.role='STUDENT' AND u.nss_id IN (${ids.map(()=>'?').join(',')}) GROUP BY u.id,y.year`,...ids);
 const lookup=new Map(balances.map(row=>[row.nss_id+':'+row.year,row]));
 const seen=new Set<string>(),changes=[];
 for(const row of b.rows){
  const nss=text(row.nss_id,'NSS ID',100),year=Number(row.year),hours=Number(row.hours),revision=Number(row.revision);
  if(![1,2].includes(year)||row.hours===null||row.hours===undefined||typeof row.hours==='boolean'||String(row.hours).trim()===''||!Number.isFinite(hours)||hours<0||hours>1000||Math.abs(hours*100-Math.round(hours*100))>0.000001||!Number.isInteger(revision)||revision<0)throw new AppError('Enter Year 1 or 2, 0–1000 hours (up to 2 decimals), and the current revision.');
  const student=lookup.get(nss+':'+year);
  if(!student)throw new AppError(`No student matches NSS ID ${nss}. Create the account first.`);
  const key=student.id+':'+year;if(seen.has(key))throw new AppError(`Duplicate NSS ID and year: ${nss}.`);seen.add(key);
  const old=student;
  if(old.revision!==revision)throw new AppError(`Historical hours for ${nss} changed. Reload the form or export a fresh template.`,409);
  if(old.hours===hours)continue;
  const delta=Math.round((hours-old.hours)*100)/100;
  changes.push(insert('historical_hours',{id:id(),user_id:student.id,year,delta,balance:hours,revision:revision+1,source,reason,service_through:'2026-10-06',actor:u.id,created_at:now()}),audit(u,'Historical hours corrected','users',student.id,{year,hours:old.hours,revision},{year,hours,delta,revision:revision+1,source,serviceThrough:'2026-10-06'},reason),notice(student.id,'Historical NSS hours updated',`Year ${year}: ${hours} hours for service completed before 7 October 2026. ${reason}`));
 }
 if(changes.length)await db().batch(changes);
 return {message:`${changes.length/3} historical balance(s) saved. Existing attendance was preserved.`};
}
export async function historicalTemplate(u:any){
 if(!canEditHistorical(u))throw new AppError('Historical entry is restricted.',403);
 return all(`SELECT u.nss_id,u.name,y.year,ROUND(COALESCE(SUM(h.delta),0),2) hours,COALESCE(MAX(h.revision),0) revision FROM users u CROSS JOIN (SELECT 1 year UNION ALL SELECT 2) y LEFT JOIN historical_hours h ON h.user_id=u.id AND h.year=y.year WHERE u.role='STUDENT' GROUP BY u.id,y.year ORDER BY u.name,y.year`);
}
