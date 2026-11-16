// Deployment preflight is read-only. Apply migrations explicitly before deploying schema changes.
import {createClient} from '@libsql/client';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
if(process.env.VERCEL_ENV!=='production'){console.log('Non-production build: database preflight skipped.');process.exit(0)}
const db=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
try{
 const applied=new Map((await db.execute('SELECT name,checksum FROM seva_migrations')).rows.map(r=>[r.name,r.checksum]));
 for(const name of (await readdir(new URL('../database/migrations/',import.meta.url))).filter(n=>n.endsWith('.sql'))){
  const hash=createHash('sha256').update(await readFile(new URL('../database/migrations/'+name,import.meta.url))).digest('hex');
  if(applied.get(name)!==hash)throw new Error('Database migration required before deployment: '+name);
 }
 console.log('Production migration preflight passed. No database records changed.');
}finally{db.close()}
