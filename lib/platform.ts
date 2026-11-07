import {createClient} from '@libsql/client';
import {randomUUID,randomBytes} from 'node:crypto';
import {platformEnabled,platformDB,platformOne,platformQuery,resolveInstitute} from './platform-core';
import {sealTenant,openTenant} from './tenant-secrets.mjs';
import {migrateTenant,claimTenantDatabase} from './tenant-schema.mjs';
import {automaticProvisioningReady,createInstituteDatabase,databaseHost} from './tenant-provider';
import {passwordHash,constantEqual,digest,cookie,sessionCookie} from './auth';
import {AppError,boundedBody} from './errors';
const now=()=>new Date().toISOString();
function text(value:any,label:string,max=200){if(typeof value!=='string'||!value.trim()||value.length>max)throw new AppError('Enter a valid '+label+'.');return value.trim()}
function passwordValue(value:any){if(typeof value!=='string'||value.length<1||value.length>128)throw new AppError('Enter a valid password.');return value}
function slug(value:any){const result=text(value,'institute code',50).toLowerCase();if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result)||result.length<3||['default','admin','platform','api','institutes'].includes(result))throw new AppError('Use an institute code of 3–50 lowercase letters, numbers or hyphens.');return result}
function safe(row:any){const {password_hash,credentials,database_host,lease,lease_until,...rest}=row;return {...rest,databaseConnected:!!credentials}}
async function limit(key:string,max:number){const slot=Math.floor(Date.now()/900000),row=await platformOne('INSERT INTO platform_rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',key+':'+slot,new Date(Date.now()+900000).toISOString());if(Number(row.count)>max)throw new AppError('Too many attempts. Try again in 15 minutes.',429)}
const audit=(actor:string,institute:string|null,action:string,reason:string)=>({sql:'INSERT INTO platform_audit VALUES(?,?,?,?,?,?)',args:[randomUUID(),actor,institute,action,reason,now()]});
async function owner(request:Request){
 const token=cookie(request,'seva_platform_session');if(!token)throw new AppError('Sign in as the platform owner.',401);
 const row=await platformOne("SELECT u.id,u.name,u.email FROM platform_sessions s JOIN platform_owner o ON o.user_id=s.user_id JOIN users u ON u.id=o.user_id WHERE s.id=? AND s.expires>? AND u.active=1 AND u.role IN ('SUPER_ADMIN','ADMIN')",await digest(token),now());
 if(!row)throw new AppError('Your owner session expired. Sign in again.',401);return row;
}
async function approve(actor:any,b:any){
 const reason=text(b.reason,'approval reason',1000);if(b.verified!==true)throw new AppError('Verify the institute and authorized contact before approval.');
 const requestId=text(b.id,'application ID',64),lease=randomUUID();
 const before=await platformOne('SELECT * FROM platform_institutes WHERE id=?',requestId);
 if(!before)throw new AppError('Application not found.',404);
 if(!before.credentials&&!b.databaseUrl&&!automaticProvisioningReady())throw new AppError('Connect automatic Turso provisioning or supply a new empty institute database before approval.',503);
 const row=await platformOne("UPDATE platform_institutes SET status='PROVISIONING',lease=?,lease_until=?,updated_at=?,reviewed_by=?,decision_reason=?,failure_message='' WHERE id=? AND (status IN ('PENDING','SETUP_FAILED') OR (status='PROVISIONING' AND lease_until<?)) RETURNING *",lease,new Date(Date.now()+600000).toISOString(),now(),actor.id,reason,requestId,now());
 if(!row)throw new AppError('This application is already approved, rejected or being set up. Refresh its status.',409);
 try{
  let connection:any;
  if(row.credentials)connection=openTenant(row.id,row.credentials);
  else{
   connection=b.databaseUrl?{url:text(b.databaseUrl,'database URL',500),authToken:text(b.databaseToken,'database access token',5000)}:await createInstituteDatabase(row.id);
   const host=databaseHost(connection.url),primary=new URL(process.env.TURSO_DATABASE_URL!).host;
   if(host===primary||connection.url===process.env.TURSO_DATABASE_URL)throw new AppError('The existing college database cannot be reused for a new institute.');
   if(await platformOne('SELECT id FROM platform_institutes WHERE database_host=? AND id!=?',host,row.id))throw new AppError('This database is already assigned to another institute.');
   const candidate=createClient(connection);try{await claimTenantDatabase(candidate,row)}finally{candidate.close()}
   const saved=await platformQuery('UPDATE platform_institutes SET credentials=?,database_host=? WHERE id=? AND lease=?',sealTenant(row.id,connection),host,row.id,lease);
   if(!saved.rowsAffected)throw new AppError('Setup was superseded. Refresh and retry.',409);
  }
  const db=createClient({...connection,intMode:'number'});
  try{
   await migrateTenant(db,row);
   const year=new Date().getUTCFullYear();
   const settings={year1:120,year2:120,defaultGeofence:250,evidenceRequired:true,allowCancellation:true,academicStart:`${year}-07-01`,academicEnd:`${year+1}-06-30`,institution:row.name,unit:'NSS Unit 01'};
   await db.batch([
    {sql:'INSERT OR IGNORE INTO settings(id,value) VALUES(?,?)',args:['program',JSON.stringify(settings)]},
    {sql:"INSERT OR IGNORE INTO users(id,email,name,role,active,department,batch,year,roll,password,mobile,password_change_required,created_at) VALUES(?,?,?,'SUPER_ADMIN',1,'NSS Unit','',0,'',?,?,0,?)",args:['institute-admin-'+row.id,row.email,row.contact_name,row.password_hash,row.mobile,now()]}
   ],'write');
   if(!(await db.execute({sql:"SELECT id FROM users WHERE id=? AND role IN ('SUPER_ADMIN','ADMIN') AND active=1",args:['institute-admin-'+row.id]})).rows.length)throw new Error('Initial administrator is missing');
  }finally{db.close()}
  await platformDB().batch([
   {sql:"UPDATE platform_institutes SET status='ACTIVE',approved_at=?,updated_at=?,lease=NULL,lease_until=NULL WHERE id=? AND lease=?",args:[now(),now(),row.id,lease]},
   audit(actor.id,row.id,'Institute approved',reason)
  ],'write');
  return {message:'Institute approved. Its separate database and administrator account are ready.',institute:row.slug};
 }catch(error){
  const message=error instanceof AppError?error.message:'Institute setup did not finish. Check database connectivity and use Retry setup. Existing college data was not changed.';
  await platformDB().batch([{sql:"UPDATE platform_institutes SET status='SETUP_FAILED',failure_message=?,updated_at=?,lease=NULL,lease_until=NULL WHERE id=? AND lease=?",args:[message,now(),row.id,lease]},audit(actor.id,row.id,'Institute setup failed',message)],'write');
  throw new AppError(message,error instanceof AppError?error.status:503);
 }
}
export async function platformRequest(request:Request,action:string){
 const response=(body:any,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 try{
  if(!platformEnabled()){if(action==='config')return response({enabled:false});throw new AppError('Institute registration is not available yet.',503)}
  if(request.method==='GET'){
   if(action==='config')return response({enabled:true});
   if(action==='current'){
    const selected=cookie(request,'seva_institute');
    if(!selected)return response({id:'default',name:'Existing college workspace'});
    const c=await resolveInstitute(selected);return response({id:c.id,name:c.name});
   }
   if(action==='directory'){
    const q=new URL(request.url).searchParams.get('q')?.trim().slice(0,100)||'';
    const rows=(await platformQuery("SELECT slug,name,city FROM platform_institutes WHERE status='ACTIVE' AND (name LIKE ? OR slug LIKE ?) ORDER BY name LIMIT 30",'%'+q+'%','%'+q+'%')).rows;
    return response({institutes:rows});
   }
   const u=await owner(request);
   if(action==='session')return response({owner:u});
   if(action==='applications'){
    const p=new URL(request.url).searchParams,page=Math.max(1,Math.min(100000,Number(p.get('page'))||1)),q=(p.get('q')||'').slice(0,100),status=p.get('status')||'ALL';
    const where="(?='ALL' OR status=?) AND (name LIKE ? OR email LIKE ? OR slug LIKE ?)";const args=[status,status,'%'+q+'%','%'+q+'%','%'+q+'%'];
    const rows=(await platformQuery('SELECT * FROM platform_institutes WHERE '+where+' ORDER BY created_at DESC LIMIT 20 OFFSET ?',...args,(page-1)*20)).rows;
    return response({rows:rows.map(safe),total:Number((await platformOne('SELECT COUNT(*) n FROM platform_institutes WHERE '+where,...args)).n),page,automaticProvisioning:automaticProvisioningReady(),counts:(await platformQuery('SELECT status,COUNT(*) count FROM platform_institutes GROUP BY status')).rows});
   }
   if(action==='audit')return response({rows:(await platformQuery('SELECT a.*,i.name institute_name FROM platform_audit a LEFT JOIN platform_institutes i ON i.id=a.institute_id ORDER BY a.created_at DESC LIMIT 100')).rows});
   throw new AppError('Page not found.',404);
  }
  if(request.method!=='POST')throw new AppError('Method not allowed.',405);
  if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')throw new AppError('Reload this page before submitting.',403);
  const b=JSON.parse(new TextDecoder().decode(await boundedBody(request,20000)));
  const ip=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';await limit('ip:'+ip,120);
  if(action==='register'){
   await limit('registration:'+ip,8);
   const code=slug(b.slug),email=text(b.email,'email',200).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new AppError('Enter a valid institute contact email.');
   const password=passwordValue(b.password);if(password.length<16)throw new AppError('Choose a password of at least 16 characters.');
   const website=text(b.website,'institute website',300);let site:URL;try{site=new URL(website)}catch{throw new AppError('Enter the institute website, starting with https://.')};if(site.protocol!=='https:'||site.username||site.password)throw new AppError('Use an HTTPS institute website.');
   const name=text(b.name,'institute name'),contact=text(b.contactName,'contact name',150),city=text(b.city,'city',100),mobile=text(b.mobile,'mobile number',20);if(!/^[+\d ()-]{7,20}$/.test(mobile))throw new AppError('Enter a valid contact phone number.');
   if(b.authorized!==true)throw new AppError('Confirm that you are authorized to apply for this institute.');
   if(await platformOne('SELECT id FROM platform_institutes WHERE slug=?',code))throw new AppError('This institute code is already in use. Choose another code or check your application.',409);
   const id=randomUUID();await platformDB().batch([
    {sql:'INSERT INTO platform_institutes(id,slug,name,city,website,contact_name,email,mobile,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',args:[id,code,name,city,website,contact,email,mobile,await passwordHash(password),now(),now()]},
    audit('applicant',id,'Institute registration submitted','Awaiting owner verification and approval')
   ],'write');return response({message:'Application submitted. Administrator access starts only after owner approval and database setup.',slug:code},201);
  }
  if(action==='status'){
   const code=slug(b.slug);await limit('status:'+code+':'+ip,10);
   const row=await platformOne('SELECT * FROM platform_institutes WHERE slug=?',code),password=passwordValue(b.password);
   if(!row?.password_hash||!constantEqual(await passwordHash(password,row.password_hash.split(':')[0]),row.password_hash))throw new AppError('Institute code or application password is incorrect.',401);
   return response({slug:row.slug,name:row.name,status:row.status,reason:['REJECTED','SUSPENDED'].includes(row.status)?row.decision_reason:'',message:row.status==='ACTIVE'?'Approved. Open your institute and sign in with the email and password used to register.':'Your application is being reviewed. Administrator access is not available yet.'});
  }
  if(action==='enter'){
   let id='';if(b.slug!=='default'){const row=await platformOne("SELECT id FROM platform_institutes WHERE slug=? AND status='ACTIVE'",slug(b.slug));if(!row)throw new AppError('This institute is not yet active.',403);id=row.id}
   const result=response({href:'/'});result.headers.append('Set-Cookie',sessionCookie('seva_institute',id,id?2592000:0));result.headers.append('Set-Cookie',sessionCookie('seva_session','',0));result.headers.append('Set-Cookie',sessionCookie('seva_owner_access','',0));return result;
  }
  if(action==='login'){
   const email=text(b.email,'email',200).toLowerCase();await limit('owner-login:'+ip+':'+await digest(email),10);
   const row=await platformOne("SELECT u.* FROM users u JOIN platform_owner o ON u.id=o.user_id WHERE o.singleton=1 AND u.email=? AND u.role IN ('SUPER_ADMIN','ADMIN') AND u.active=1",email);
   const password=passwordValue(b.password);
   if(!row?.password||!constantEqual(await passwordHash(password,row.password.split(':')[0]),row.password))throw new AppError('Owner email or password is incorrect.',401);
   const token=randomBytes(32).toString('hex');await platformQuery('INSERT INTO platform_sessions VALUES(?,?,?)',await digest(token),row.id,new Date(Date.now()+28800000).toISOString());const result=response({owner:{id:row.id,name:row.name,email:row.email}});result.headers.append('Set-Cookie',sessionCookie('seva_platform_session',token));return result;
  }
  const u=await owner(request);await limit('owner:'+u.id,100);
  if(action==='logout'){await platformQuery('DELETE FROM platform_sessions WHERE id=?',await digest(cookie(request,'seva_platform_session')||''));const result=response({message:'Signed out.'});result.headers.append('Set-Cookie',sessionCookie('seva_platform_session','',0));result.headers.append('Set-Cookie',sessionCookie('seva_owner_access','',0));return result}
  if(action==='manage'){
   const reason=text(b.reason,'workspace access reason',1000),isDefault=b.id==='default';
   const institute=isDefault?null:await platformOne("SELECT * FROM platform_institutes WHERE id=? AND status='ACTIVE'",text(b.id,'institute ID',64));
   if(!isDefault&&!institute)throw new AppError('Activate this institute before opening its workspace.',403);
   const connection=isDefault?{url:process.env.TURSO_DATABASE_URL!,authToken:process.env.TURSO_AUTH_TOKEN!}:openTenant(institute.id,institute.credentials);
   const client=createClient(connection),proxyId=isDefault?u.id:'platform-owner-'+u.id;
   try{
    if(!isDefault)await client.execute({sql:"INSERT INTO users(id,email,name,role,active,department,batch,year,roll,password,owner_proxy,created_at) VALUES(?,?,?,'SUPER_ADMIN',1,'Platform','',0,'',?,1,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,active=1",args:[proxyId,'platform-owner-'+u.id+'@owner.invalid','Platform owner · '+u.name,'owner-only:'+randomBytes(32).toString('hex'),now()]});
    await client.execute({sql:'INSERT INTO audit_logs(id,actor,role,action,entity,entity_id,old_value,new_value,reason,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',args:[randomUUID(),proxyId,'OWNER','Owner workspace opened','institute',isDefault?'default':institute.id,'null','{}',reason,now()]});
   }finally{client.close()}
   const token=randomBytes(32).toString('hex'),session=await digest(cookie(request,'seva_platform_session')!);
   await platformDB().batch([
    {sql:'DELETE FROM platform_workspace_access WHERE session_id=? OR expires<?',args:[session,now()]},
    {sql:'INSERT INTO platform_workspace_access VALUES(?,?,?,?,?)',args:[await digest(token),session,isDefault?'default':'institute-'+institute.id,proxyId,new Date(Date.now()+14400000).toISOString()]},
    audit(u.id,institute?.id||null,'Owner workspace opened',reason)
   ],'write');
   const result=response({href:'/'});result.headers.append('Set-Cookie',sessionCookie('seva_owner_access',token,14400));result.headers.append('Set-Cookie',sessionCookie('seva_institute',institute?.id||'',institute?2592000:0));result.headers.append('Set-Cookie',sessionCookie('seva_session','',0));return result;
  }
  if(action==='leave-workspace'){
   await platformQuery('DELETE FROM platform_workspace_access WHERE id=? AND session_id=?',await digest(cookie(request,'seva_owner_access')||''),await digest(cookie(request,'seva_platform_session')||''));
   const result=response({href:'/platform'});for(const name of ['seva_owner_access','seva_session','seva_institute'])result.headers.append('Set-Cookie',sessionCookie(name,'',0));return result;
  }
  if(action==='approve')return response(await approve(u,b));
  if(['reject','suspend','resume'].includes(action)){
   const id=text(b.id,'application ID',64),reason=text(b.reason,'decision reason',1000),row=await platformOne('SELECT * FROM platform_institutes WHERE id=?',id);
   const allowed=action==='reject'?['PENDING','SETUP_FAILED']:action==='suspend'?['ACTIVE']:['SUSPENDED'];
   if(!row||!allowed.includes(row.status))throw new AppError('This action is not available for the current institute status.',409);
   // Clear existing sessions before resuming; suspending takes effect on every request.
   if(action==='suspend'||action==='resume')await platformQuery('DELETE FROM platform_workspace_access WHERE institute_id=?','institute-'+id);
   if(action==='resume'){const c=openTenant(row.id,row.credentials),client=createClient(c);try{await client.execute('DELETE FROM sessions')}finally{client.close()}}
   const target=action==='reject'?'REJECTED':action==='suspend'?'SUSPENDED':'ACTIVE';
   await platformDB().batch([{sql:'UPDATE platform_institutes SET status=?,decision_reason=?,reviewed_by=?,updated_at=? WHERE id=? AND status=?',args:[target,reason,u.id,now(),id,row.status]},audit(u.id,id,'Institute '+action,reason)],'write');
   return response({message:'Institute '+(action==='reject'?'rejected':action==='suspend'?'suspended':'reactivated')+'.'});
  }
  throw new AppError('Action not found.',404);
 }catch(error){return response({error:error instanceof AppError?error.message:'We could not complete this request. Please try again.'},error instanceof AppError?error.status:500)}
}
