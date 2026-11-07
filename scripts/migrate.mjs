import {createClient} from '@libsql/client';
import {collegeConfigs} from '../lib/college-config.mjs';
import {readFile,readdir} from 'node:fs/promises';
import {createHash,randomUUID,pbkdf2Sync} from 'node:crypto';
const colleges=collegeConfigs();
const targets=colleges.length?colleges:[{id:'default',url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN}];
for(const {id:collegeId,url,authToken} of targets){
if(!url||!authToken)throw new Error('Connect a Turso database to this deployment environment before building SevaTrack.');
if(process.env.VERCEL_ENV&&process.env.VERCEL_ENV!=='production')throw new Error('Preview migrations require a separate database and a reviewed deployment workflow.');
const client=createClient({url,authToken,intMode:'number'});
try{
 await client.execute('CREATE TABLE IF NOT EXISTS seva_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)');
 for(const name of (await readdir(new URL('../database/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort()){
  const contents=await readFile(new URL('../database/migrations/'+name,import.meta.url),'utf8');
  const checksum=createHash('sha256').update(contents).digest('hex');
  const existing=await client.execute({sql:'SELECT checksum FROM seva_migrations WHERE name=?',args:[name]});
  if(existing.rows.length){if(existing.rows[0].checksum!==checksum)throw new Error('Applied migration changed: '+name);continue;}
  await client.batch([...contents.split('--> statement-breakpoint').map(sql=>sql.trim()).filter(Boolean),{sql:'INSERT INTO seva_migrations VALUES (?,?,?)',args:[name,checksum,new Date().toISOString()]}],'write');
  console.log('Applied migration:',name);
 }
 const today=new Date(),academicYear=today.getUTCMonth()>=6?today.getUTCFullYear():today.getUTCFullYear()-1;
 const settings={year1:120,year2:120,defaultGeofence:250,evidenceRequired:true,allowCancellation:true,academicStart:`${academicYear}-07-01`,academicEnd:`${academicYear+1}-06-30`,institution:'Your institution',unit:'NSS Unit 01'};
 await client.execute({sql:'INSERT OR IGNORE INTO settings (id,value) VALUES (?,?)',args:['program',JSON.stringify(settings)]});
 const admin=await client.execute("SELECT id FROM users WHERE role IN ('SUPER_ADMIN','ADMIN') LIMIT 1");
 if(!admin.rows.length){
  const prefix=collegeId==='default'?'SEVATRACK':`SEVATRACK_${collegeId.toUpperCase().replaceAll('-','_')}`;
  const email=process.env[prefix+'_ADMIN_EMAIL']?.trim().toLowerCase(),password=process.env[prefix+'_ADMIN_PASSWORD'];
  if(email&&password){
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<16||password.length>128)throw new Error('Initial administrator needs a valid email and a password of 16–128 characters.');
   const salt=randomUUID(),hash=salt+':'+pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex');
   await client.execute({sql:"INSERT INTO users (id,email,name,role,password,created_at) SELECT ?,?,?,'SUPER_ADMIN',?,? WHERE NOT EXISTS(SELECT 1 FROM users WHERE role IN ('SUPER_ADMIN','ADMIN'))",args:[randomUUID(),email,process.env[prefix+'_ADMIN_NAME']||'NSS Administrator',hash,new Date().toISOString()]});
   console.log('Initial administrator created. Remove bootstrap password environment variable after verifying login.');
  }else console.log('Administrator setup pending: add SEVATRACK_ADMIN_EMAIL and SEVATRACK_ADMIN_PASSWORD, then redeploy.');
 }
 console.log('SevaTrack schema ready; no demonstration records installed.');
}finally{client.close();}

}

// Control-plane tables are installed only in the original database.
if(process.env.SEVATRACK_PLATFORM_ENABLED==='1'){
 if(colleges.length)throw new Error('Self-service institutes require the default control database; keep host-based mode separate.');
 const {openTenant}=await import('../lib/tenant-secrets.mjs');
 const {migrateTenant}=await import('../lib/tenant-schema.mjs');
 const master=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
 try{
  const schema=await readFile(new URL('../database/platform.sql',import.meta.url),'utf8');
  await master.batch(schema.split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean),'write');
  const existing=await master.execute('SELECT user_id FROM platform_owner WHERE singleton=1');
  if(!existing.rows.length){
   const owner=(await master.execute({sql:"SELECT id FROM users WHERE email=? AND role IN ('SUPER_ADMIN','ADMIN') AND active=1",args:[(process.env.SEVATRACK_PLATFORM_OWNER_EMAIL||'').toLowerCase()]})).rows[0];
   if(!owner)throw new Error('Configure the email of an existing active administrator as SEVATRACK_PLATFORM_OWNER_EMAIL.');
   await master.execute({sql:'INSERT OR IGNORE INTO platform_owner VALUES(1,?)',args:[owner.id]});
  }
  await master.execute("UPDATE users SET role='SUPER_ADMIN' WHERE id=(SELECT user_id FROM platform_owner WHERE singleton=1) AND role='ADMIN'");
  // Every managed database receives the same checksum-verified schema on deployment.
  const tenants=(await master.execute("SELECT id,credentials FROM platform_institutes WHERE credentials IS NOT NULL AND status IN ('ACTIVE','SUSPENDED')")).rows;
  for(const tenant of tenants){const c=openTenant(tenant.id,tenant.credentials),client=createClient(c);try{await migrateTenant(client,tenant)}finally{client.close()}}
  console.log('Institute portal schema ready; managed institute schemas verified.');
 }finally{master.close()}
}
