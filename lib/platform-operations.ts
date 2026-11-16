import {protectInstituteDatabases} from './tenant-provider';
import migrations from '@/database/migration-manifest.json';
import {createClient} from '@libsql/client';
import {get,put} from '@vercel/blob';
import {randomUUID} from 'node:crypto';
import {platformQuery} from './platform-core';
import {openTenant} from './tenant-secrets.mjs';
import {snapshotDatabase,encryptBackup,decryptBackup,checksum} from './operational-backup.mjs';

async function targets(){
 const rows=(await platformQuery("SELECT id,name,credentials FROM platform_institutes WHERE credentials IS NOT NULL AND status IN ('ACTIVE','SUSPENDED') ORDER BY id")).rows;
 return [{id:'platform',name:'Platform',connection:()=>({url:process.env.TURSO_DATABASE_URL!,authToken:process.env.TURSO_AUTH_TOKEN!})},...rows.map(r=>({id:String(r.id),name:String(r.name),connection:()=>openTenant(r.id,r.credentials)}))];
}
export async function operationalHealth(){
 const results=[];
 for(const target of await targets()){
  let db;
  try{db=createClient(target.connection());await db.execute('SELECT 1');
   const fk=await db.execute('PRAGMA foreign_key_check');
   const applied=(await db.execute('SELECT name,checksum FROM seva_migrations')).rows;
   const schemaCurrent=migrations.every(m=>applied.some(r=>r.name===m.name&&r.checksum===m.checksum));
   const backup=(await platformQuery("SELECT value FROM settings WHERE id=?",'backup:'+target.id)).rows[0];
   const attempt=(await platformQuery('SELECT value FROM settings WHERE id=?','backup-attempt:'+target.id)).rows[0];
   results.push({attempt:attempt?JSON.parse(String(attempt.value)):null,id:target.id,name:target.name,reachable:true,schemaCurrent,integrity:fk.rows.length===0,backup:backup?JSON.parse(String(backup.value)):null});
  }catch{results.push({id:target.id,name:target.name,reachable:false,integrity:false,backup:null})}
  finally{db?.close()}
 }
 const protection=(await platformQuery("SELECT value FROM settings WHERE id='backup:protection'")).rows[0];
 return {protection:protection?JSON.parse(String(protection.value)):null,checkedAt:new Date().toISOString(),backupConfigured:!!process.env.SEVATRACK_BACKUP_KEY&&!!process.env.BLOB_READ_WRITE_TOKEN,results};
}
export async function runOperationalBackup(actor:string){
 const key=process.env.SEVATRACK_BACKUP_KEY,token=process.env.BLOB_READ_WRITE_TOKEN;
 if(!/^[a-f0-9]{64}$/i.test(key||'')||!token)throw new Error('Backup configuration is incomplete');
 // Atomic lease prevents overlapping owner and cron runs, including multiple instances.
 const lease=randomUUID(),now=Date.now();
 const lock=await platformQuery("INSERT INTO settings(id,value) VALUES('backup:lease',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value WHERE CAST(json_extract(settings.value,'$.until') AS INTEGER)<? RETURNING id",JSON.stringify({lease,until:now+600000}),now);
 if(!lock.rows.length)return {message:'A backup is already running.',results:[]};
 const results=[];
 try{
  const protection=await protectInstituteDatabases();
  await platformQuery("INSERT INTO settings(id,value) VALUES('backup:protection',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",JSON.stringify({...protection,checkedAt:new Date().toISOString()}));
  for(const target of await targets()){
   let db;
   try{
    if(Date.now()-now>240000)throw new Error('Time budget exhausted');
    db=createClient({...target.connection(),intMode:'bigint'});
    const snapshot=await snapshotDatabase(db),prefix='backups/v2/'+target.id+'/'+new Date().toISOString().replaceAll(':','-')+'-'+randomUUID()+'/';
    const write=async(name:string,bytes:Buffer)=>{
     const pathname=prefix+name;
     await put(pathname,encryptBackup(bytes,key),{access:'private',token,addRandomSuffix:false,contentType:'application/octet-stream'});
     const saved=await get(pathname,{access:'private',token,useCache:false});
     if(!saved||saved.statusCode!==200)throw new Error('Backup verification failed');
     const restored=decryptBackup(Buffer.from(await new Response(saved.stream).arrayBuffer()),key);
     if(checksum(restored)!==checksum(bytes))throw new Error('Backup verification failed');
     return {pathname,sha256:checksum(bytes),size:bytes.length};
    };
    const database=await write('database.enc',Buffer.from(JSON.stringify(snapshot)));
    const evidence=snapshot.tables.find((t:any)=>t.name==='evidence'),photos=[];
    if(evidence){const ki=evidence.columns.indexOf('key'),mi=evidence.columns.indexOf('mime');
     if(ki<0||mi<0)throw new Error('Invalid evidence schema');
     for(const row of evidence.rows){
      if(Date.now()-now>240000)throw new Error('Time budget exhausted');
      const path=row[ki];if(typeof path!=='string'||!(target.id==='platform'?/^evidence\/[^/]+\/[^/]+$/.test(path):path.startsWith('institutes/institute-'+target.id+'/evidence/')&&/^institutes\/institute-[a-f0-9-]{36}\/evidence\/[^/]+\/[^/]+$/.test(path)))throw new Error('Invalid evidence path');
      const result=await get(path,{access:'private',token,useCache:false});
      if(!result||result.statusCode!==200)throw new Error('Evidence unavailable');
      const bytes=Buffer.from(await new Response(result.stream).arrayBuffer());
      if(!bytes.length||bytes.length>5*1024*1024)throw new Error('Invalid evidence size');
      photos.push({path,mime:row[mi],...await write(checksum(Buffer.from(path))+'.enc',bytes)});
     }
    }
    // Manifest is committed only after every referenced photo is copied successfully.
    const manifest=await write('manifest.enc',Buffer.from(JSON.stringify({format:'sevatrack-encrypted-backup-v2',institute:target.id,createdAt:snapshot.createdAt,database,photos})));
    const status={ok:true,completedAt:new Date().toISOString(),manifest:manifest.pathname,photos:photos.length};
    await platformQuery('INSERT INTO settings(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value','backup:'+target.id,JSON.stringify(status));
    await platformQuery('INSERT INTO settings(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value','backup-attempt:'+target.id,JSON.stringify({ok:true,at:status.completedAt}));
    results.push({id:target.id,ok:true});
   }catch{
    // Keep the last successful recovery point when a newer attempt fails.
    await platformQuery('INSERT INTO settings(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value','backup-attempt:'+target.id,JSON.stringify({ok:false,at:new Date().toISOString()}));
    results.push({id:target.id,ok:false});
   }finally{db?.close()}
  }
  await platformQuery('INSERT INTO platform_audit VALUES(?,?,?,?,?,?)',randomUUID(),actor,null,'BACKUP_COMPLETED',JSON.stringify(results),new Date().toISOString());
  return {message:results.every(r=>r.ok)?'Backups completed.':'Some backups failed. Check institute health and retry.',results};
 }finally{await platformQuery("DELETE FROM settings WHERE id='backup:lease' AND json_extract(value,'$.lease')=?",lease)}
}
