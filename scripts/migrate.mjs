import {createClient} from '@libsql/client';
import {readFile,readdir} from 'node:fs/promises';
import {createHash,randomUUID,pbkdf2Sync} from 'node:crypto';
const {TURSO_DATABASE_URL:url,TURSO_AUTH_TOKEN:authToken}=process.env;
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
 const admin=await client.execute("SELECT id FROM users WHERE role='ADMIN' LIMIT 1");
 if(!admin.rows.length){
  const email=process.env.SEVATRACK_ADMIN_EMAIL?.trim().toLowerCase(),password=process.env.SEVATRACK_ADMIN_PASSWORD;
  if(email&&password){
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<16||password.length>128)throw new Error('Initial administrator needs a valid email and a password of 16–128 characters.');
   const salt=randomUUID(),hash=salt+':'+pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex');
   await client.execute({sql:"INSERT INTO users (id,email,name,role,password,created_at) SELECT ?,?,?,'ADMIN',?,? WHERE NOT EXISTS(SELECT 1 FROM users WHERE role='ADMIN')",args:[randomUUID(),email,process.env.SEVATRACK_ADMIN_NAME||'NSS Administrator',hash,new Date().toISOString()]});
   console.log('Initial administrator created. Remove bootstrap password environment variable after verifying login.');
  }else console.log('Administrator setup pending: add SEVATRACK_ADMIN_EMAIL and SEVATRACK_ADMIN_PASSWORD, then redeploy.');
 }
 console.log('SevaTrack schema ready; no demonstration records installed.');
}finally{client.close();}
