// Read-only schema diagnostics. Never prints tokens, passwords or user rows.
import {createClient} from '@libsql/client';
import {openTenant} from '../lib/tenant-secrets.mjs';
const master=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN,intMode:'number'});
const report=(data)=>console.log('[institute-setup-diagnostic]',JSON.stringify(data));
let stage='registry';
try{
 const failed=(await master.execute("SELECT id,credentials FROM platform_institutes WHERE status='SETUP_FAILED' ORDER BY updated_at DESC LIMIT 5")).rows;
 report({failedApplications:failed.length});
 for(const [index,row] of failed.entries()){
  try{
   let connection;
   if(row.credentials){stage='decrypt';connection=openTenant(row.id,row.credentials)}
   else{
    stage='provider-lookup';
    const base='https://api.turso.tech/v1/organizations/'+encodeURIComponent(process.env.SEVATRACK_TURSO_ORGANIZATION)+'/databases/seva-'+row.id.replaceAll('-','');
    const headers={Authorization:'Bearer '+process.env.SEVATRACK_TURSO_API_TOKEN};
    const r=await fetch(base,{headers,signal:AbortSignal.timeout(15000)});
    if(!r.ok){report({index,stage,status:r.status});continue}
    const data=await r.json(),host=data.database?.Hostname||data.database?.hostname;
    if(typeof host!=='string'||!/^([a-z0-9-]+\.)+turso\.io$/.test(host)){report({index,stage,error:'invalid-host'});continue}
    stage='read-only-token';
    const t=await fetch(base+'/auth/tokens?authorization=read-only&expiration=5m',{method:'POST',headers,signal:AbortSignal.timeout(15000)});
    if(!t.ok){report({index,stage,status:t.status});continue}
    connection={url:'libsql://'+host,authToken:(await t.json()).jwt};
   }
   stage='schema-read';const db=createClient({...connection,intMode:'number'});
   try{
    const objects=(await db.execute("SELECT name,type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name")).rows;
    report({index,stage,checkpointSaved:!!row.credentials,objects});
   }finally{db.close()}
  }catch(e){report({index,stage,errorName:e.name,errorCode:e.code||e.cause?.code||'unknown'})}
 }
}catch(e){report({stage,errorName:e.name,errorCode:e.code||'unknown'})}finally{master.close()}
