const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {randomBytes}=require('node:crypto'),{createClient}=require('@libsql/client');
(async()=>{
 process.env.SEVATRACK_TENANT_KEY=randomBytes(32).toString('hex');
 const {recoverFreshInstitute,recoveryProvider}=await import('../scripts/recover-fresh-institute.mjs');
 const {sealTenant,openTenant}=await import('../lib/tenant-secrets.mjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'seva-fresh-'));
 const master=createClient({url:'file:'+path.join(dir,'master.db')});
 const id='12345678-1234-1234-1234-123456789abc',slug='03724';
 const old={url:'libsql://seva-'+id.replaceAll('-','')+'-enigmatic-aries-tm8p44.aws-eu-west-1.turso.io',authToken:'old-test-token'};
 const replacement={url:'file:'+path.join(dir,'fresh.db'),authToken:''};
 const original=sealTenant(id,old);
 await master.execute('CREATE TABLE users(id TEXT PRIMARY KEY,active INTEGER,role TEXT)');
 await master.execute("INSERT INTO users VALUES('owner',1,'SUPER_ADMIN')");
 await master.batch(fs.readFileSync('database/platform.sql','utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean),'write');
 await master.execute("INSERT INTO platform_owner VALUES(1,'owner')");
 await master.execute({sql:"INSERT INTO platform_institutes(id,slug,name,city,website,contact_name,email,mobile,password_hash,status,credentials,database_host,created_at,updated_at) VALUES(?,?,?,'Mumbai','https://example.test','Coordinator','admin@example.test','1234567890','test:hash','ACTIVE',?,?,?,?)",args:[id,slug,'THAKUR SHREE DPS COLLEGE OF ENGINEERING AND MANAGEMENT',original,new URL(old.url).hostname,new Date().toISOString(),new Date().toISOString()]});
 await master.execute({sql:'INSERT INTO platform_workspace_access VALUES(?,?,?,?,?)',args:['old-grant','session','institute-'+id,'proxy','2100-01-01']});
 let calls=0;
 const provision=async()=>{calls++;return replacement};
 await assert.rejects(()=>recoverFreshInstitute({master,provision:async()=>{throw new Error('Provider unavailable')}}),/Provider unavailable/);
 assert.equal((await master.execute('SELECT credentials FROM platform_institutes')).rows[0].credentials,original);
 // Initialization failure cannot replace the mapping or affect owner access.
 await assert.rejects(()=>recoverFreshInstitute({master,provision,connect:()=>({execute:async()=>{throw new Error('DB unavailable')},close(){}})}),/DB unavailable/);
 assert.equal((await master.execute('SELECT credentials FROM platform_institutes')).rows[0].credentials,original);
 const result=await recoverFreshInstitute({master,provision});assert.equal(result.status,'recovered');
 const after=(await master.execute('SELECT * FROM platform_institutes')).rows[0];
 assert.equal(openTenant(id,after.credentials).url,replacement.url);assert.equal(after.status,'ACTIVE');
 assert.equal((await master.execute('SELECT * FROM platform_owner')).rows[0].user_id,'owner');
 assert.equal((await master.execute('SELECT * FROM platform_workspace_access')).rows.length,0);
 assert.equal((await master.execute('SELECT * FROM platform_audit')).rows.length,1);
 const fresh=createClient(replacement);
 assert.equal((await fresh.execute('SELECT role,email FROM users WHERE active=1')).rows[0].role,'SUPER_ADMIN');
 for(const t of ['events','attendance','hour_ledger','evidence'])assert.equal(Number((await fresh.execute('SELECT COUNT(*) n FROM '+t)).rows[0].n),0);
 // Repeat recovery does not clear activity or append another recovery audit.
 await fresh.execute("INSERT INTO settings VALUES('recovery-test','preserve')");
 assert.equal((await recoverFreshInstitute({master,provision})).status,'already-recovered');
 assert.equal((await fresh.execute("SELECT value FROM settings WHERE id='recovery-test'")).rows[0].value,'preserve');
 assert.equal((await master.execute('SELECT * FROM platform_audit')).rows.length,1);
 // Foreign institute databases must be refused.
 const other={url:'file:'+path.join(dir,'other.db')},otherDb=createClient(other);
 await otherDb.execute('CREATE TABLE seva_tenant_identity(singleton INTEGER PRIMARY KEY,institute_id TEXT)');await otherDb.execute("INSERT INTO seva_tenant_identity VALUES(1,'another-institute')");otherDb.close();
 await assert.rejects(()=>recoverFreshInstitute({master,provision:async()=>other}),/different institute/);
 assert.equal(openTenant(id,(await master.execute('SELECT credentials FROM platform_institutes')).rows[0].credentials).url,replacement.url);
 // Suspension and owner removal are checked before provisioning.
 await master.execute("UPDATE platform_institutes SET status='SUSPENDED'");const count=calls;
 await assert.rejects(()=>recoverFreshInstitute({master,provision}),/target does not match/);assert.equal(calls,count);
 await master.execute("UPDATE platform_institutes SET status='ACTIVE'");await master.execute('UPDATE users SET active=0');
 await assert.rejects(()=>recoverFreshInstitute({master,provision}),/active platform owner/);assert.equal(calls,count);
 const env={SEVATRACK_TURSO_ORGANIZATION:'enigmatic-aries-tm8p44',SEVATRACK_TURSO_GROUP:'sevatrack',SEVATRACK_TURSO_API_TOKEN:'fake-token'};
 const row={id,database_host:new URL(old.url).hostname};
 // Never recreate a database just because the service returned 502 or 401.
 for(const status of [200,502,401,403]){
  let hits=0;
  const p=recoveryProvider(env,async()=>{hits++;return new Response('{}',{status})});
  await assert.rejects(()=>p(row,old));assert.equal(hits,1);
 }
 let requests=[];
 const name='seva-'+id.replaceAll('-','')+'-r1',host=name+'-enigmatic-aries-tm8p44.aws-eu-west-1.turso.io';
 const replies=[new Response('',{status:404}),new Response('',{status:404}),Response.json({database:{Hostname:host}}),Response.json({jwt:'new-test-token'})];
 const p=recoveryProvider(env,async(url,options)=>{requests.push({url,options});return replies.shift()});
 assert.equal((await p(row,old)).url,'libsql://'+host);
 assert.equal(requests[2].options.method,'POST');assert.equal(JSON.parse(requests[2].options.body).name,name);
 assert(!requests.some(r=>r.options.method==='DELETE'));
 assert.equal((await p(row,{url:'libsql://'+host,authToken:'existing'})).authToken,'existing');assert.equal(requests.length,4);
 fresh.close();master.close();fs.rmSync(dir,{recursive:true,force:true});
 console.log('Fresh recovery checks passed: missing-only provider gate, exact target, owner preservation, safe failure, empty replacement, audit, session revocation, tenant isolation and idempotent retry.');
})().catch(e=>{console.error(e);process.exitCode=1});
