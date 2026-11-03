// Point-in-time logical snapshot. Never writes to the source database.
import {createClient} from '@libsql/client';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
const output=process.argv[2];
if(!output)throw new Error('Usage: npm run db:backup -- backups/dated-backup.json');
if(!process.env.TURSO_DATABASE_URL)throw new Error('Set TURSO_DATABASE_URL in your private environment.');
const db=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN,intMode:'bigint'});
const quote=s=>'"'+s.replaceAll('"','""')+'"';
const encode=v=>typeof v==='bigint'?{$integer:String(v)}:v instanceof ArrayBuffer||ArrayBuffer.isView(v)?{$blob:Buffer.from(v instanceof ArrayBuffer?v:v.buffer,v.byteOffset||0,v.byteLength).toString('base64')}:v;
let tx;
try{
 tx=await db.transaction('read');
 const schema=(await tx.execute("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name")).rows.map(r=>({type:r.type,name:r.name,sql:r.sql}));
 const tables=[];
 for(const item of schema.filter(x=>x.type==='table')){
  const result=await tx.execute('SELECT * FROM '+quote(item.name));
  tables.push({name:item.name,columns:result.columns,rows:result.rows.map(row=>result.columns.map(k=>encode(row[k])))});
 }
 await tx.rollback();tx=null;
 const target=resolve(output);await mkdir(dirname(target),{recursive:true});
 await writeFile(target,JSON.stringify({format:'sevatrack-backup-v1',createdAt:new Date().toISOString(),schema,tables}),{flag:'wx',mode:0o600});
 console.log('Database snapshot saved. It includes private account data: keep it outside GitHub and share securely.');
 console.log('Photo bytes are NOT included. Preserve the private Blob store separately.');
}finally{if(tx)await tx.rollback();db.close()}
