// Actual API + auth + SQL migrations + ledger triggers. Only Blob/network and GPS
// hardware are substituted. No production records or credentials are used.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),{webcrypto}=require('node:crypto');
const {createClient}=require('@libsql/client');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'seva-workflow-'));
const blobs=new Map(),cache=new Map(),realNow=Date.now();let time=realNow;
class Clock extends Date{constructor(...a){super(...(a.length?a:[time]))}static now(){return time}}
const blob={get:async(key,opts)=>{const b=blobs.get(opts?.token+':'+key);return b?{statusCode:200,blob:{size:b.bytes.length,contentType:b.mime},stream:new Response(b.bytes).body}:null},del:async(keys,opts)=>{for(const key of Array.isArray(keys)?keys:[keys])blobs.delete(opts?.token+':'+key)},list:async opts=>({blobs:[...blobs.keys()].filter(k=>k.startsWith(opts.token+':'+opts.prefix)).map(k=>({pathname:k.slice(opts.token.length+1)}))})};
let collegeConfig;
function load(filename){
 filename=path.resolve(filename);if(cache.has(filename))return cache.get(filename);
 const out={};cache.set(filename,out);
 const req=name=>{
  if(name==='@vercel/blob')return blob;
  if(name.endsWith('.json'))return require(path.resolve(name.replace('@/', './')));
  if(name.endsWith('college-config.mjs'))return collegeConfig;
  if(name.startsWith('@/'))return load(name.slice(2)+'.ts');
  if(name.startsWith('.'))return load(path.resolve(path.dirname(filename),name)+'.ts');
  return require(name);
 };
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,{exports:out,require:req,Date:Clock,process,crypto:webcrypto,Request,Response,URL,URLSearchParams,TextDecoder,TextEncoder,Uint8Array,ArrayBuffer,DataView,Buffer,console,setTimeout,clearTimeout},{filename});
 return out;
}
const password='Disposable-password-for-QA-2026';
async function main(){
 collegeConfig=await import('../lib/college-config.mjs');
 const env={...process.env,TURSO_DATABASE_URL:'file:'+path.join(temp,'a.db'),TURSO_AUTH_TOKEN:'test-only',SEVATRACK_ADMIN_EMAIL:'admin@example.test',SEVATRACK_ADMIN_PASSWORD:password};delete env.SEVATRACK_COLLEGES;delete env.VERCEL_ENV;
 for(const name of ['a','b']){const r=spawnSync(process.execPath,['scripts/migrate.mjs'],{env:{...env,TURSO_DATABASE_URL:'file:'+path.join(temp,name+'.db')},encoding:'utf8'});assert.equal(r.status,0,r.stderr)}
 Object.assign(process.env,{TURSO_DATABASE_URL:env.TURSO_DATABASE_URL,TURSO_AUTH_TOKEN:'test-only',BLOB_READ_WRITE_TOKEN:'vercel_blob_rw_storeA_test',COLLEGE_B_URL:'file:'+path.join(temp,'b.db'),COLLEGE_B_TOKEN:'test-only',COLLEGE_B_BLOB:'vercel_blob_rw_storeB_test'});
 process.env.SEVATRACK_COLLEGES=JSON.stringify([{id:'a',hosts:['a.example.test'],databaseUrlEnv:'TURSO_DATABASE_URL',databaseTokenEnv:'TURSO_AUTH_TOKEN',blobTokenEnv:'BLOB_READ_WRITE_TOKEN'},{id:'b',hosts:['b.example.test'],databaseUrlEnv:'COLLEGE_B_URL',databaseTokenEnv:'COLLEGE_B_TOKEN',blobTokenEnv:'COLLEGE_B_BLOB'}]);
 const api=load('app/api/[...path]/route.ts');let checks=0;
 async function call(endpoint,body,cookie,expected=200,host='a.example.test',extraHeaders={}){
  const headers={origin:'https://'+host,...extraHeaders};if(cookie)headers.cookie=cookie;
  const req=new Request('https://'+host+'/api/'+endpoint,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)});
  const response=await api[body===undefined?'GET':'POST'](req);const text=await response.text();let data;try{data=JSON.parse(text)}catch{data=text}
  assert.equal(response.status,expected,`${endpoint}: ${text}`);checks++;return {data,response};
 }
 async function login(email,host='a.example.test'){return (await call('auth',{action:'login',email,password},null,200,host)).response.headers.get('set-cookie').split(';')[0]}
 const admin=await login('admin@example.test');
 assert.match(admin,/seva_session=/);
 assert.equal((await call('system-health',undefined,admin)).data.ok,true);
 await call('state',undefined,null,401);
 await call('state',undefined,admin,401,'b.example.test');
 await call('state?college=a',undefined,admin,421,'unknown.example.test',{'x-forwarded-host':'a.example.test'});
 const bAdmin=await login('admin@example.test','b.example.test');
 async function user(name,role){
  const {data}=await call('user',{name,email:name+'@example.test',role,active:true,department:'Science',batch:'2026',year:1,nss_id:role==='STUDENT'?name:null,roll:name,reason:'Isolated test account'},admin);
  const {data:link}=await call('recovery',{user:data.id},admin);
  await call('auth',{action:'reset',token:link.token,password});
  await call('auth',{action:'reset',token:link.token,password},null,400);
  return {id:data.id,cookie:await login(name+'@example.test')};
 }
 const student=await user('student','STUDENT'),peer=await user('peer','STUDENT'),faculty=await user('faculty','FACULTY'),outsider=await user('other-faculty','FACULTY');
 for(const kind of ['department','batch','academic_year','category']){
  await call('catalog',{kind,name:'QA '+kind},admin);
  const {data:s}=await call('state',undefined,admin);
  const entry=s.catalogs.find(c=>c.kind===kind&&c.name==='QA '+kind);
  await call(kind==='batch'?'delete-batch':'delete-catalog',{id:entry.id,kind,reason:'QA cleanup'},admin);
 }
 await call('system-health',undefined,student.cookie,403);
 const {data:s}=await call('state',undefined,admin);
 const event={title:'QA volunteer event',category:s.catalogs.find(c=>c.kind==='category').name,description:'Isolated workflow verification',start:new Date(realNow+10*60000).toISOString(),end:new Date(realNow+120*60000).toISOString(),deadline:new Date(realNow+5*60000).toISOString(),hours:2,location:'Test campus',lat:19,lng:72,radius:250,capacity:10,coordinator:faculty.id,status:'Registration Open'};
 const {data:created}=await call('event',event,admin);const eid=created.id;
 await call('event',event,student.cookie,403);
 await call('event-detail?id='+eid,undefined,outsider.cookie,403);
 await call('register',{event:eid},student.cookie);
 await call('register',{event:eid},student.cookie,400);
 const {data:registered}=await call('event-detail?id='+eid,undefined,student.cookie);const aid=registered.record.id;
 await call('attendance-detail?id='+aid,undefined,peer.cookie,403);
 const gps=()=>({lat:19,lng:72,accuracy:12,clientTime:new Date(time).toISOString()});
 await call('check',{id:aid,kind:'in',location:{...gps(),lat:20}},student.cookie,400);
 await call('check',{id:aid,kind:'in',location:gps()},student.cookie);
 await call('check',{id:aid,kind:'in',location:gps()},student.cookie,400);
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf1sAAAAASUVORK5CYII=','base64');
 const proof={attendance:aid,mime:'image/png',size:bytes.length,location:gps(),source:'geotag-app',capture:{lat:19,lng:72,time:new Date(time).toISOString(),app:'QA camera'}};
 await call('upload-prepare',proof,peer.cookie,403);
 const {data:ticket}=await call('upload-prepare',proof,student.cookie);
 blobs.set(process.env.BLOB_READ_WRITE_TOKEN+':'+ticket.path,{bytes,mime:'image/png'});
 await call('upload-finish',{id:ticket.id},student.cookie);
 await call('file/'+ticket.id,undefined,null,401);
 await call('file/'+ticket.id,undefined,peer.cookie,403);
 await call('file/'+ticket.id,undefined,student.cookie);
 await call('file/'+ticket.id,undefined,faculty.cookie);
 await call('file/'+ticket.id,undefined,outsider.cookie,403);
 time+=60*60000;
 await call('check',{id:aid,kind:'out',location:gps()},student.cookie);
 const detail=async()=> (await call('attendance-detail?id='+aid,undefined,student.cookie)).data.record;
 let record=await detail();assert.equal(record.status,'PENDING_REVIEW');
 const originals=[record.original_in,record.original_out,record.location_in,record.location_out];
 let edit={id:aid,revision:record.revision,status:'PENDING_REVIEW',hours:0,effective_in:new Date(realNow+60000).toISOString(),effective_out:new Date(time-60000).toISOString(),reason:'Corrected against event register'};
 await call('review',{...edit,reason:''},faculty.cookie,400);
 await call('review',edit,faculty.cookie);
 record=await detail();assert.deepEqual([record.original_in,record.original_out,record.location_in,record.location_out],originals);
 const approval={...edit,revision:record.revision,status:'APPROVED',hours:1};
 await call('review',approval,faculty.cookie,403);
 await call('review',approval,student.cookie,403);
 await call('review',approval,admin,400); // Photo must be approved first.
 await call('evidence-review',{id:ticket.id,status:'APPROVED',reason:'Reviewed location and image'},faculty.cookie);
 await call('review',approval,admin);
 await call('review',approval,admin,400); // Stale revision cannot double-credit.
 await call('upload-prepare',proof,student.cookie,403);
 await call('evidence-review',{id:ticket.id,status:'REJECTED',reason:'Race attempt'},faculty.cookie,400);
 const {data:approved}=await call('state',undefined,student.cookie);assert.equal(approved.counts.hours,1);assert.equal(approved.students[0].y1,1);assert.equal(approved.students[0].y2,0);
 const {data:audit}=await call('audit?attendance='+aid,undefined,student.cookie);assert(audit.some(a=>a.reason===edit.reason));assert(audit.some(a=>a.actor===faculty.id));
 await call('audit?attendance='+aid,undefined,peer.cookie,403);
 for(const kind of ['attendance','events','reports','audit','history','notifications','evidence','corrections'])await call('records?kind='+kind+'&size=10&page=1&q=QA',undefined,admin);
 await call('records?kind=reports',undefined,student.cookie,403);
 await call('export?type=attendance',undefined,admin);
 await call('export?type=history',undefined,student.cookie);
 // Each concurrent request must keep its own college through asynchronous I/O.
 const states=await Promise.all(Array.from({length:20},(_,i)=>call('state',undefined,i%2?admin:bAdmin,200,i%2?'a.example.test':'b.example.test')));
 states.forEach(({data},i)=>assert.equal(data.students.length,i%2?2:0));
 // Source migrations rerun without altering accounts, passwords, or hours.
 const rerun=spawnSync(process.execPath,['scripts/migrate.mjs'],{env,encoding:'utf8'});assert.equal(rerun.status,0,rerun.stderr);
 await login('student@example.test');
 assert.equal((await call('state',undefined,student.cookie)).data.counts.hours,1);
 await call('delete-account',{id:student.id,email:'student@example.test',password,reason:'Remove isolated test account'},admin);
 await call('state',undefined,student.cookie,401);
 await call('deletion-cleanup',{},admin);assert.equal(blobs.size,0);
 await call('file/'+ticket.id,undefined,admin,400);
 console.log(`${checks} real-handler integration requests passed: login, roles, attendance/GPS, private-photo authorization, original-time audit, hours, exports, persistence, cleanup and concurrent college isolation. Blob and GPS hardware were simulated.`);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{fs.rmSync(temp,{recursive:true,force:true})});
