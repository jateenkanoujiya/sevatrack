// Explicit one-time recovery. Never invoked by the normal build or an API route.
import {createClient} from '@libsql/client';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {openTenant,sealTenant} from '../lib/tenant-secrets.mjs';
import {migrateTenant} from '../lib/tenant-schema.mjs';

const slug='03724';
const expectedName='THAKUR SHREE DPS COLLEGE OF ENGINEERING AND MANAGEMENT';
const reason='User authorized a fresh empty institute database on 2026-11-16. Previous institute records are not restored.';
const timestamp=()=>new Date().toISOString();
export async function recoverFreshInstitute({master,provision,connect=createClient}){
 const row=(await master.execute({sql:'SELECT * FROM platform_institutes WHERE slug=?',args:[slug]})).rows[0];
 if(!row||row.name!==expectedName||row.status!=='ACTIVE'||!row.credentials||!row.password_hash)throw new Error('The approved recovery target does not match. No mapping changed.');
 const owner=(await master.execute("SELECT u.id FROM platform_owner o JOIN users u ON u.id=o.user_id WHERE o.singleton=1 AND u.active=1 AND u.role IN ('SUPER_ADMIN','ADMIN')")).rows[0];
 if(!owner)throw new Error('An active platform owner is required.');
 const previous=openTenant(row.id,row.credentials);
 const connection=await provision(row,previous);
 const host=connection.url.startsWith('file:')?connection.url:new URL(connection.url).hostname;
 const existing=(await master.execute({sql:'SELECT id FROM platform_institutes WHERE database_host=? AND id!=?',args:[host,row.id]})).rows;
 if(existing.length)throw new Error('Replacement database is assigned to another institute.');
 const db=connect(connection);
 try{
  await migrateTenant(db,row);
  // A repeat deployment verifies the already connected replacement, never resets it.
  if(previous.url===connection.url){
   const admin=(await db.execute({sql:"SELECT id FROM users WHERE id=? AND active=1 AND role='SUPER_ADMIN'",args:['institute-admin-'+row.id]})).rows[0];
   if(!admin)throw new Error('Replacement administrator is missing.');
   return {status:'already-recovered',slug};
  }
  for(const table of ['events','attendance','hour_ledger','historical_hours','past_events','past_event_hours','evidence','sessions']){
   if(Number((await db.execute('SELECT COUNT(*) n FROM '+table)).rows[0].n)!==0)throw new Error('Replacement contains activity; refusing to overwrite it.');
  }
  const adminId='institute-admin-'+row.id;
  if((await db.execute({sql:"SELECT id FROM users WHERE id!=? AND NOT(id='__deleted_actor__' AND role='SYSTEM' AND active=0)",args:[adminId]})).rows.length)throw new Error('Replacement contains other accounts.');
  const year=new Date().getUTCFullYear();
  const settings={year1:120,year2:120,defaultGeofence:250,evidenceRequired:true,allowCancellation:true,academicStart:`${year}-07-01`,academicEnd:`${year+1}-06-30`,institution:row.name,unit:'NSS Unit 01'};
  await db.batch([
   {sql:'INSERT OR IGNORE INTO settings(id,value) VALUES(?,?)',args:['program',JSON.stringify(settings)]},
   {sql:"INSERT OR IGNORE INTO users(id,email,name,role,active,department,batch,year,roll,password,mobile,password_change_required,created_at) VALUES(?,?,?,'SUPER_ADMIN',1,'NSS Unit','',0,'',?,?,0,?)",args:[adminId,row.email,row.contact_name,row.password_hash,row.mobile,timestamp()]}
  ],'write');
  const admin=(await db.execute({sql:"SELECT id FROM users WHERE id=? AND active=1 AND role='SUPER_ADMIN' AND password=?",args:[adminId,row.password_hash]})).rows[0];
  if(!admin)throw new Error('Replacement administrator verification failed.');
 }finally{db.close()}
 // Recheck inside a transaction; an intervening approval/suspension must win.
 const tx=await master.transaction('write');
 try{
  const updated=await tx.execute({sql:"UPDATE platform_institutes SET credentials=?,database_host=?,failure_message='',updated_at=? WHERE id=? AND credentials=? AND status='ACTIVE' AND lease IS NULL",args:[sealTenant(row.id,connection),host,timestamp(),row.id,row.credentials]});
  if(updated.rowsAffected!==1)throw new Error('Institute changed during recovery. No mapping changed.');
  await tx.execute({sql:'DELETE FROM platform_workspace_access WHERE institute_id=?',args:['institute-'+row.id]});
  await tx.execute({sql:'INSERT INTO platform_audit VALUES(?,?,?,?,?,?)',args:[randomUUID(),owner.id,row.id,'Fresh institute database connected',reason+' Previous host: '+row.database_host+'; replacement: '+host,timestamp()]});
  await tx.commit();
 }catch(error){await tx.rollback();throw error}finally{tx.close()}
 return {status:'recovered',slug,students:0,events:0,hours:0};
}

export function recoveryProvider(env=process.env,fetcher=fetch){
 const org=env.SEVATRACK_TURSO_ORGANIZATION?.trim(),group=env.SEVATRACK_TURSO_GROUP?.trim(),token=env.SEVATRACK_TURSO_API_TOKEN?.trim();
 if(org!=='enigmatic-aries-tm8p44'||group!=='sevatrack'||!token)throw new Error('Expected institute provisioning configuration is missing.');
 if(!/^[\x21-\x7e]+$/.test(token)||/["']/.test(token))throw new Error('Invalid Turso provisioning credential format.');
 const base='https://api.turso.tech/v1/organizations/'+encodeURIComponent(org)+'/databases';
 async function send(path,options={}){
  let response;
  try{response=await fetcher(base+path,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(20000)})}catch{throw new Error('Turso provider request failed. No mapping changed.')}
  if([401,403].includes(response.status))throw new Error('Turso provisioning access was denied ('+response.status+').');
  return response;
 }
 return async(row,previous)=>{
  if(!/^[a-f0-9-]{36}$/.test(row.id))throw new Error('Invalid institute identifier.');
  const oldName='seva-'+row.id.replaceAll('-',''),newName=oldName+'-r1';
  const oldHost=new URL(previous.url).hostname;
  if(previous.url.startsWith('libsql:')&&oldHost.startsWith(newName+'-'+org+'.'))return previous;
  if(!previous.url.startsWith('libsql:')||!oldHost.startsWith(oldName+'-'+org+'.')||oldHost!==row.database_host)throw new Error('Stored database does not match the expected institute organization.');
  const old=await send('/'+oldName);
  if(old.status!==404)throw new Error('Original database is not confirmed missing; recovery stopped without replacing it.');
  let replacement=await send('/'+newName);
  if(replacement.status===404)replacement=await send('',{method:'POST',body:JSON.stringify({name:newName,group})});
  if(!replacement.ok)throw new Error('Replacement database creation failed ('+replacement.status+').');
  const data=await replacement.json(),host=data.database?.Hostname||data.database?.hostname;
  if(typeof host!=='string'||!host.startsWith(newName+'-'+org+'.')||!host.endsWith('.turso.io')||!/^[a-z0-9.-]+$/.test(host))throw new Error('Unexpected replacement database host.');
  const response=await send('/'+newName+'/auth/tokens?authorization=full-access&expiration=never',{method:'POST'});
  if(!response.ok)throw new Error('Replacement token issuance failed.');
  const {jwt}=await response.json();if(typeof jwt!=='string'||!jwt)throw new Error('Invalid replacement token.');
  return {url:'libsql://'+host,authToken:jwt};
 };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let master;
 try{
  if(process.env.VERCEL_ENV!=='production'||process.env.SEVATRACK_PLATFORM_ENABLED!=='1'||process.env.SEVATRACK_COLLEGES||process.argv[2]!=='--confirm-fresh-03724')throw new Error('Recovery requires the explicitly authorized production invocation.');
  if(!process.env.TURSO_DATABASE_URL||!process.env.TURSO_AUTH_TOKEN)throw new Error('Control database is not configured.');
  const provision=recoveryProvider();
  master=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
  const result=await recoverFreshInstitute({master,provision});
  console.log('Institute recovery verified:',JSON.stringify(result));
 }catch(error){
  // Avoid leaking connection URLs, credentials, or provider response bodies in build logs.
  const safe=error instanceof Error&&!(error.code||error.cause)?error.message:'Database recovery failed; no credentials are logged.';
  console.error(safe);process.exitCode=1;
 }finally{master?.close()}
}
