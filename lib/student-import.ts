import {all,one,db,insert,id,now,audit} from './db';
import {passwordHash} from './auth';
import {currentCollege} from './college';
import {AppError} from './errors';
export function mobileNumber(value:any){const text=String(value??'').trim().replace(/[\s()-]/g,'');if(text&&!/^\+?\d{10,15}$/.test(text))throw new AppError('Mobile must contain 10–15 digits, with an optional country prefix.');return text}
function required(value:any,label:string,max=150){if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new AppError(`${label} is required (maximum ${max} characters).`);return value.trim()}
export function importPassword(){const college=currentCollege().id;const key=college==='default'?'SEVATRACK_IMPORT_PASSWORD':`SEVATRACK_${college.toUpperCase().replaceAll('-','_')}_IMPORT_PASSWORD`;const password=process.env[key];if(!password||password.length<12||password.length>128)throw new AppError('Student import password is not configured. Ask the deployment administrator to configure the private import password.',503);return password}
export async function inspectStudentImport(u:any,rows:any){
 if(!['SUPER_ADMIN','ADMIN'].includes(u.role)||!u.active)throw new AppError('Only administrators can import students.',403);
 if(!Array.isArray(rows)||!rows.length||rows.length>200)throw new AppError('Import 1–200 students per file.');
 const users=await all('SELECT id,email,nss_id,role FROM users');const byEmail=new Map(users.map(x=>[x.email.toLowerCase(),x])),byNss=new Map(users.filter(x=>x.nss_id).map(x=>[x.nss_id.toLowerCase(),x]));
 const emails=new Set(),ids=new Set(),results=[];
 for(let i=0;i<rows.length;i++){const x=rows[i];try{
  if(!x||typeof x!=='object')throw new AppError('Invalid row.');
  const email=required(x.email,'Email',200).toLowerCase(),nss_id=required(x.nss_id,'NSS ID',100).toUpperCase(),year=Number(x.year);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new AppError('Enter a valid email.');
  if(![1,2].includes(year)||typeof x.year==='boolean')throw new AppError('NSS year must be 1 or 2.');
  const data={name:required(x.name,'Full name'),email,mobile:mobileNumber(x.mobile),nss_id,roll:required(x.roll,'Roll number',100),department:required(x.department,'Department',100),batch:required(x.batch,'NSS batch',100),year};
  if(emails.has(email)||ids.has(nss_id.toLowerCase()))throw new AppError('Duplicate email or NSS ID within this file.');emails.add(email);ids.add(nss_id.toLowerCase());
  const a=byEmail.get(email),b=byNss.get(nss_id.toLowerCase());
  if(a||b){if(!a||!b||a.id!==b.id||!['STUDENT','VOLUNTEER'].includes(a.role))throw new AppError('Email or NSS ID conflicts with an existing account.');results.push({row:i+2,data,status:'skip',message:'Existing student: account, details and password will remain unchanged.'})}
  else results.push({row:i+2,data,status:'new',message:'Ready to create with a temporary password.'});
 }catch(e){results.push({row:i+2,status:'error',message:e instanceof AppError?e.message:'Invalid student details.'})}}
 return {rows:results,create:results.filter(x=>x.status==='new').length,skip:results.filter(x=>x.status==='skip').length,errors:results.filter(x=>x.status==='error').length};
}
export async function importStudents(u:any,b:any){
 const preview=await inspectStudentImport(u,b.rows);
 if(preview.errors)throw new AppError(`Fix ${preview.errors} row error(s) in the import preview. No students were imported.`);
 if(!preview.create)return {message:`No new accounts. ${preview.skip} existing students were kept unchanged.`,created:0,skipped:preview.skip};
 const password=importPassword(),writes=[];
 for(const row of preview.rows.filter(x=>x.status==='new')){const uid=id(),data=row.data!;writes.push(insert('users',{id:uid,...data,role:'STUDENT',active:1,password:await passwordHash(password),password_change_required:1,created_at:now()}),audit(u,'Student imported','users',uid,null,{...data,passwordChangeRequired:true},'Verified spreadsheet import'))}
 await db().batch(writes);
 return {message:`${preview.create} student accounts created. ${preview.skip} existing accounts unchanged. New students must change their temporary password at first login.`,created:preview.create,skipped:preview.skip};
}
