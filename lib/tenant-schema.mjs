import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
export async function claimTenantDatabase(client,institute){
 const ownership=await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='seva_tenant_identity'");
 if(!ownership.rows.length){
  const existing=await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  if(existing.rows.length)throw new Error('Use a new empty database. Existing databases cannot be assigned to an institute.');
  await client.batch(['CREATE TABLE seva_tenant_identity (singleton INTEGER PRIMARY KEY CHECK(singleton=1),institute_id TEXT NOT NULL)',{sql:'INSERT INTO seva_tenant_identity VALUES (1,?)',args:[institute.id]}],'write');
 }
 const identity=await client.execute('SELECT institute_id FROM seva_tenant_identity WHERE singleton=1');
 if(identity.rows[0]?.institute_id!==institute.id)throw new Error('This database belongs to a different institute.');
}
export async function migrateTenant(client,institute){
 await claimTenantDatabase(client,institute);
 await client.execute('CREATE TABLE IF NOT EXISTS seva_migrations (name TEXT PRIMARY KEY,checksum TEXT NOT NULL,applied_at TEXT NOT NULL)');
 const dir=join(process.cwd(),'database/migrations');
 for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort()){
  const text=await readFile(join(dir,name),'utf8'),checksum=createHash('sha256').update(text).digest('hex');
  const old=(await client.execute({sql:'SELECT checksum FROM seva_migrations WHERE name=?',args:[name]})).rows[0];
  if(old){if(old.checksum!==checksum)throw new Error('Applied institute migration changed');continue}
  await client.batch([...text.split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean),{sql:'INSERT INTO seva_migrations VALUES (?,?,?)',args:[name,checksum,new Date().toISOString()]}],'write');
 }
 if((await client.execute('PRAGMA foreign_key_check')).rows.length)throw new Error('Institute database integrity check failed');
}
