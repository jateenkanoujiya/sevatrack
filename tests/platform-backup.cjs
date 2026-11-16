const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const {createClient}=require('@libsql/client'),{randomBytes}=require('node:crypto');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'seva-ops-')),url='file:'+path.join(dir,'master.db'),tenantUrl='file:'+path.join(dir,'tenant.db');
 const master=createClient({url}),tenant=createClient({url:tenantUrl}),objects=new Map();
 const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',photo='institutes/institute-'+id+'/evidence/student/photo';
 Object.assign(process.env,{TURSO_DATABASE_URL:url,TURSO_AUTH_TOKEN:'test',SEVATRACK_BACKUP_KEY:randomBytes(32).toString('hex'),BLOB_READ_WRITE_TOKEN:'private-test'});
 let writes=0,missing=false,hold=false,release,blocked;
 const blob={put:async(p,bytes,options)=>{assert.equal(options.access,'private');assert.equal(options.addRandomSuffix,false);objects.set(p,bytes);writes++;if(hold){hold=false;blocked?.();await new Promise(r=>release=r)}},get:async p=>{if(p===photo)return missing?null:{statusCode:200,stream:Buffer.from('evidence')};return objects.has(p)?{statusCode:200,stream:objects.get(p)}:null}};
 const query=(sql,...args)=>master.execute({sql,args});
 const out={};
 const req=n=>n==='./tenant-provider'?{protectInstituteDatabases:async()=>({ok:true})}:n==='@/database/migration-manifest.json'?[]:n==='@vercel/blob'?blob:n==='./platform-core'?{platformQuery:query}:n==='./tenant-secrets.mjs'?{openTenant:()=>({url:tenantUrl})}:n==='./operational-backup.mjs'?require('../lib/operational-backup.mjs'):require(n);
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/platform-operations.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:out,require:req,process,Buffer,Response,Date,JSON},{filename:'platform-operations'});
 try{
 await master.batch(['CREATE TABLE settings(id TEXT PRIMARY KEY,value TEXT)','CREATE TABLE platform_institutes(id TEXT,name TEXT,credentials TEXT,status TEXT)','CREATE TABLE platform_audit(id TEXT,actor TEXT,institute_id TEXT,action TEXT,reason TEXT,created_at TEXT)',{sql:"INSERT INTO platform_institutes VALUES(?,?,?,'ACTIVE')",args:[id,'Test institute','encrypted']}],'write');
 await tenant.execute('CREATE TABLE evidence(key TEXT,mime TEXT)');await tenant.execute({sql:'INSERT INTO evidence VALUES(?,?)',args:[photo,'image/png']});
 const first=await out.runOperationalBackup('owner');assert(first.results.every(r=>r.ok));assert.equal(first.results.length,2);assert.equal(writes,5);
 const saved=(await query('SELECT value FROM settings WHERE id=?','backup:'+id)).rows[0].value;
 missing=true;const failed=await out.runOperationalBackup('owner');assert.equal(failed.results.find(r=>r.id===id).ok,false);assert.equal((await query('SELECT value FROM settings WHERE id=?','backup:'+id)).rows[0].value,saved);assert.equal(JSON.parse((await query('SELECT value FROM settings WHERE id=?','backup-attempt:'+id)).rows[0].value).ok,false);
 missing=false;hold=true;const started=new Promise(r=>blocked=r);const running=out.runOperationalBackup('owner');await started;const overlap=await out.runOperationalBackup('owner');assert.equal(overlap.results.length,0);release();await running;
 await tenant.execute({sql:'UPDATE evidence SET key=?',args:['institutes/institute-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/evidence/student/photo']});const crossed=await out.runOperationalBackup('owner');assert.equal(crossed.results.find(r=>r.id===id).ok,false);
 console.log('PASS private encrypted backup readback, institute photo scope, failure isolation, preserved recovery point and concurrent-run lease');
 }finally{master.close();tenant.close();fs.rmSync(dir,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
