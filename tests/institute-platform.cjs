// Isolated real SQL databases and handlers. No production network, accounts or data.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),{webcrypto,randomBytes}=require('node:crypto'),{createClient}=require('@libsql/client');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'seva-platform-')),cache=new Map();
function load(filename){filename=path.resolve(filename);if(cache.has(filename))return cache.get(filename);const out={};cache.set(filename,out);const req=n=>{
 if(n.endsWith('.json'))return require(path.resolve(n.replace('@/', './')));
 if(n.endsWith('.mjs'))return require(path.resolve(path.dirname(filename),n));
 if(n.startsWith('@/'))return load(n.slice(2)+'.ts');if(n.startsWith('.'))return load(path.resolve(path.dirname(filename),n)+'.ts');return require(n);
};vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,{exports:out,require:req,process,crypto:webcrypto,Request,Response,URL,URLSearchParams,AbortSignal,TextDecoder,TextEncoder,Uint8Array,ArrayBuffer,DataView,Buffer,console,setTimeout,clearTimeout},{filename});return out}
async function main(){
 const password='Disposable-platform-password-2026';
 Object.assign(process.env,{NODE_ENV:'test',SEVATRACK_TEST_TENANTS:'1',SEVATRACK_PLATFORM_ENABLED:'1',TURSO_DATABASE_URL:'file:'+path.join(dir,'master.db'),TURSO_AUTH_TOKEN:'test',SEVATRACK_ADMIN_EMAIL:'owner@example.test',SEVATRACK_ADMIN_PASSWORD:password,SEVATRACK_PLATFORM_OWNER_EMAIL:'owner@example.test',SEVATRACK_TENANT_KEY:randomBytes(32).toString('hex'),BLOB_READ_WRITE_TOKEN:'vercel_blob_rw_TEST_private'});delete process.env.SEVATRACK_COLLEGES;delete process.env.VERCEL_ENV;
 const migrate=spawnSync(process.execPath,['scripts/migrate.mjs'],{env:process.env,encoding:'utf8'});assert.equal(migrate.status,0,migrate.stderr);
 const master=createClient({url:process.env.TURSO_DATABASE_URL,authToken:'test'}),{platformRequest}=load('lib/platform.ts'),api=load('app/api/[...path]/route.ts');let checks=0;
 async function call(action,b,cookie='',expected=200,headers={}){const r=new Request('https://seva.example.test/api/platform/'+action,{method:b===undefined?'GET':'POST',headers:{origin:'https://seva.example.test',cookie,...headers},body:b===undefined?undefined:JSON.stringify(b)});const response=await platformRequest(r,action.split('?')[0]);const d=await response.json();assert.equal(response.status,expected,action+': '+JSON.stringify(d));checks++;return {d,cookie:response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')}}
 async function app(action,b,cookie='',expected=200,headers={}){const r=new Request('https://seva.example.test/api/'+action,{method:b===undefined?'GET':'POST',headers:{origin:'https://seva.example.test',cookie,...headers},body:b===undefined?undefined:JSON.stringify(b)});const response=await api[b===undefined?'GET':'POST'](r),d=await response.json();assert.equal(response.status,expected,action+': '+JSON.stringify(d));checks++;return {d,cookie:response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')}}
 const owner=(await call('login',{email:'owner@example.test',password})).cookie;
 await call('applications',undefined,'',401);
 await call('register',{},'',403,{origin:'https://attacker.example'});
 const registration=(slug)=>({slug,name:'Institute '+slug,city:'Mumbai',website:'https://college.example.test',contactName:'Coordinator',email:'coordinator@example.test',mobile:'+919876543210',password,authorized:true});
 for(const slug of ['alpha-college','beta-college'])await call('register',registration(slug),'',201);
 await call('register',registration('alpha-college'),'',409);
 await call('enter',{slug:'alpha-college'},'',403);
 await call('status',{slug:'alpha-college',password:'incorrect'},'',401);
 assert.equal((await call('status',{slug:'alpha-college',password})).d.status,'PENDING');
 const applications=(await call('applications',undefined,owner)).d.rows;assert.equal(applications.length,2);assert(!JSON.stringify(applications).includes('password_hash'));
 const alpha=applications.find(x=>x.slug==='alpha-college'),beta=applications.find(x=>x.slug==='beta-college');
 const aurl='file:'+path.join(dir,'a.db'),burl='file:'+path.join(dir,'b.db');
 const approve=(id,url)=>({id,databaseUrl:url,databaseToken:'test',reason:'Authorized coordinator verified',verified:true});
 await call('approve',approve(alpha.id,aurl),'',401);
 await call('approve',{...approve(alpha.id,aurl),verified:false},owner,400);
 await call('approve',approve(alpha.id,process.env.TURSO_DATABASE_URL),owner,400);
 await call('approve',approve(alpha.id,aurl),owner);
 await call('approve',approve(alpha.id,aurl),owner,409);
 await call('approve',approve(beta.id,aurl),owner,400);
 await call('approve',approve(beta.id,burl),owner);
 assert.equal((await call('status',{slug:'alpha-college',password})).d.status,'ACTIVE');
 assert.equal((await call('directory')).d.institutes.length,2);
 const acookie='seva_institute='+alpha.id,bcookie='seva_institute='+beta.id;
 const alogin=(await app('auth',{action:'login',email:'coordinator@example.test',password},acookie)).cookie;
 const blogin=(await app('auth',{action:'login',email:'coordinator@example.test',password},bcookie)).cookie;
 const a=acookie+'; '+alogin,b=bcookie+'; '+blogin;
 await app('state',undefined,acookie+'; '+blogin,401);
 await app('state',undefined,bcookie+'; '+alogin,401);
 await app('state',undefined,'seva_institute=invalid',421);
 await app('state',undefined,a,409,{'x-seva-institute':'institute-'+beta.id});
 const [astate,bstate]=await Promise.all([app('state',undefined,a),app('state',undefined,b)]);
 assert.equal(astate.d.settings.institution,'Institute alpha-college');assert.equal(bstate.d.settings.institution,'Institute beta-college');
 await call('applications',undefined,a,401);
 await call('login',{email:'coordinator@example.test',password},a,401);
 const student={name:'Student Alpha',email:'student@example.test',role:'STUDENT',active:true,department:'Science',batch:'2026',year:1,nss_id:'A001',roll:'1',reason:'Enrollment'};
 const added=(await app('user',student,a)).d;
 assert((await app('state',undefined,a)).d.students.some(x=>x.id===added.id));assert.equal((await app('state',undefined,b)).d.students.length,0);
 await app('user',{...student,id:added.id,name:'Cross institute edit'},b,400);
 await app('attendance-detail?id=other-institute-record',undefined,b,403);
 // Shared private object storage must be namespaced, including account cleanup.
 const college=load('lib/college.ts');let ap,bp;
 await college.withCollegeRequest(new Request('https://seva.example.test',{headers:{cookie:acookie}}),async()=>{ap=college.storagePath('evidence/same-user/photo');return new Response()});
 await college.withCollegeRequest(new Request('https://seva.example.test',{headers:{cookie:bcookie}}),async()=>{bp=college.storagePath('evidence/same-user/photo');return new Response()});assert.notEqual(ap,bp);assert(ap.startsWith('institutes/institute-'+alpha.id+'/'));
 // Institute Super Admins control settings; all lower roles are denied server-side.
 assert.equal(astate.d.user.role,'SUPER_ADMIN');assert.equal(bstate.d.user.role,'SUPER_ADMIN');
 const superId=astate.d.user.id,settings={...astate.d.settings,reason:'Institute leadership test'};
 await app('settings',settings,a);
 await app('catalog',{kind:'department',name:'Private alpha department'},a);
 assert(!(await app('state',undefined,b)).d.catalogs.some(x=>x.name==='Private alpha department'));
 let regular;
 for(const role of ['ADMIN','FACULTY','VOLUNTEER','STUDENT']){
  const person={...student,name:role,email:role.toLowerCase()+'@isolation.test',nss_id:'test-'+role,role};
  const created=(await app('user',person,a)).d;
  const reset=(await app('recovery',{user:created.id},a)).d;
  await app('auth',{action:'reset',token:reset.token,password},acookie);
  const signed=(await app('auth',{action:'login',email:person.email,password},acookie)).cookie;
  const cookies=acookie+'; '+signed;
  for(const endpoint of ['settings','catalog','delete-catalog','delete-batch'])await app(endpoint,{},cookies,403);
  await app('system-health',undefined,cookies,403);
  await call('manage',{id:beta.id,reason:'Cross-institute attempt'},cookies,401);
  if(role==='ADMIN'){
   regular={id:created.id,cookie:cookies,person};
   await app('user',{...person,id:created.id,role:'SUPER_ADMIN'},cookies,403);
   await app('user',{...person,email:'new-admin@isolation.test',role:'ADMIN'},cookies,403);
   await app('user',{...person,id:superId,role:'ADMIN'},cookies,403);
   await app('recovery',{user:superId},cookies,403);
   await app('delete-account',{id:superId,email:'coordinator@example.test',password,reason:'Attempt'},cookies,403);
  }
 }
 await app('user',{...regular.person,role:'SUPER_ADMIN',id:regular.id},a,403);
 // A valid owner session explicitly opens one workspace, with auditable attribution.
 await call('manage',{id:alpha.id,reason:''},owner,400);
 const support=(await call('manage',{id:alpha.id,reason:'Review institute settings'},owner)).cookie+'; '+owner;
 const supportState=(await app('state',undefined,support)).d;
 assert.equal(supportState.user.isPlatformOwner,true);assert.equal(supportState.user.role,'SUPER_ADMIN');
 assert(supportState.institute.id.endsWith(alpha.id));assert(!supportState.users.some(x=>x.id===supportState.user.id));
 await app('state',undefined,support.replace(alpha.id,beta.id),401);
 await app('state',undefined,support.replace(owner,''),401);
 await app('settings',{...settings,unit:'Owner reviewed unit'},support);
 assert.equal((await app('state',undefined,b)).d.settings.unit,'NSS Unit 01');
 assert((await app('audit',undefined,support)).d.some(x=>x.role==='OWNER'&&x.action==='Program settings updated'));
 await app('recovery',{user:supportState.user.id},a,403);
 await app('user',{...regular.person,id:regular.id,role:'SUPER_ADMIN'},support);
 // The owner can transfer leadership, but cannot leave an institute without a Super Admin.
 await app('user',{...regular.person,id:regular.id,role:'ADMIN'},support);
 await app('user',{name:'Coordinator',email:'coordinator@example.test',role:'ADMIN',active:true,department:'NSS',id:superId,reason:'Attempt to remove final Super Admin'},support,409);
 const disposable=(await app('user',{...student,email:'disposable@test.example',nss_id:'temporary',name:'Disposable'},support)).d;
 await app('delete-account',{id:disposable.id,email:'disposable@test.example',password,reason:'Remove isolated test account'},support);
 const supportB=(await call('manage',{id:beta.id,reason:'Review second institute'},owner)).cookie+'; '+owner;
 await app('state',undefined,support,401);
 assert.equal((await app('state',undefined,supportB)).d.institute.id,'institute-'+beta.id);
 await call('leave-workspace',{},supportB);
 await app('state',undefined,supportB,401);
 const suspendedSupport=(await call('manage',{id:alpha.id,reason:'Check suspension'},owner)).cookie+'; '+owner;
 await call('suspend',{id:alpha.id,reason:'Review requested'},owner);
 await app('state',undefined,suspendedSupport,403);
 await app('state',undefined,a,403);await call('enter',{slug:'alpha-college'},'',403);
 await call('resume',{id:alpha.id,reason:'Review completed'},owner);
 await app('state',undefined,a,401);
 assert.equal((await app('state',undefined,b)).d.students.length,0);
 // Existing owner cannot be replaced, removed or recovered by another legacy admin.
 const mainLogin=(await app('auth',{action:'login',email:'owner@example.test',password})).cookie;
 const other=(await app('user',{name:'Other admin',email:'other@example.test',role:'ADMIN',department:'NSS',active:true,reason:'Staff'},mainLogin)).d;
 const recovery=(await app('recovery',{user:other.id},mainLogin)).d;
 await app('auth',{action:'reset',token:recovery.token,password});
 const otherLogin=(await app('auth',{action:'login',email:'other@example.test',password})).cookie;
 await call('login',{email:'other@example.test',password},otherLogin,401);
 const ownerID=(await master.execute('SELECT user_id FROM platform_owner')).rows[0].user_id;
 await app('user',{id:ownerID,role:'ADMIN',name:'Hijack',email:'hijack@example.test',active:true,department:'NSS',reason:'Attempt'},otherLogin,403);
 await app('recovery',{user:ownerID},otherLogin,403);
 await app('delete-account',{id:ownerID,email:'owner@example.test',password,reason:'Attempt'},otherLogin,403);
 // Credentials are encrypted and bound to their institute ID.
 const stored=(await master.execute({sql:'SELECT credentials FROM platform_institutes WHERE id=?',args:[alpha.id]})).rows[0].credentials;
 assert(!stored.includes(aurl));const {openTenant}=require('../lib/tenant-secrets.mjs');assert.throws(()=>openTenant(beta.id,stored));
 assert((await call('audit',undefined,owner)).d.rows.some(x=>x.action==='Institute approved'));
 const rerun=spawnSync(process.execPath,['scripts/migrate.mjs'],{env:process.env,encoding:'utf8'});assert.equal(rerun.status,0,rerun.stderr);
 const client=createClient({url:aurl});assert.equal((await client.execute('SELECT COUNT(*) n FROM users WHERE role=\'STUDENT\'')).rows[0].n,2);client.close();
 const logoutSupport=(await call('manage',{id:beta.id,reason:'Session revocation test'},owner)).cookie+'; '+owner;
 await call('logout',{},owner);await app('state',undefined,logoutSupport,401);
 master.close();console.log(`${checks} institute portal requests passed: registration, pending gates, owner-only approval, separate databases, same-email isolation, cross-session denial, storage namespaces, suspension, session revocation, owner protection and migration persistence.`);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>fs.rmSync(dir,{recursive:true,force:true}));
