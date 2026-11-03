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
 // Staff accounts require no student enrollment fields, and supplied stale values are discarded.
 for(const role of ['ADMIN','FACULTY']){
  const payload={name:'Staff '+role,email:'staff-'+role.toLowerCase()+'@example.test',role,active:true,department:'Science',reason:'Staff profile regression'};
  const createdStaff=(await call('user',payload,admin)).data;
  await call('user',{...payload,id:createdStaff.id,batch:'Must not persist',year:2,roll:'STALE',nss_id:'STALE-'+role},admin);
  const staff=(await call('state',undefined,admin)).data.users.find(x=>x.id===createdStaff.id);
  assert.equal(staff.batch,'');assert.equal(staff.roll,'');assert.equal(staff.nss_id,null);assert.equal(staff.year,null);
 }
 const staffProfile=(await call('state',undefined,faculty.cookie)).data.user;
 assert.equal(staffProfile.year,null);assert.equal(staffProfile.batch,'');assert.equal(staffProfile.roll,'');
 for(const role of ['STUDENT','VOLUNTEER']){
  await call('user',{name:'Incomplete participant',email:'missing-'+role+'@example.test',role,active:true,department:'Science',nss_id:'missing-'+role,reason:'Required fields test'},admin,400);
 }

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
 // Real archived-event requests: separate attestation, immutable ledger and scoped visibility.
 const archived={title:'Past campus service',category:event.category,description:'Verified service from a signed register',start:new Date(realNow-86400000).toISOString(),end:new Date(realNow-72000000).toISOString(),hours:4,location:'Old campus',coordinator:faculty.id,source:'Signed register page 12',reason:'Import completed service'};
 await call('past-event',archived,student.cookie,403);
 await call('past-event',archived,faculty.cookie,403);
 await call('past-event',{...archived,end:new Date(realNow+86400000).toISOString()},admin,400);
 await call('past-event',{...archived,source:''},admin,400);
 const {data:createdPast}=await call('past-event',archived,admin),pastId=createdPast.id;
 await call('past-event',archived,admin,409);
 await call('past-event?id='+pastId,undefined,student.cookie,403);
 await call('past-event?id='+pastId,undefined,outsider.cookie,403);
 await call('past-event?id='+pastId,undefined,bAdmin,404,'b.example.test');
 const pastCredit={event:pastId,source:'Signed register page 12',reason:'Approved verified participation',confirmNotCounted:true,rows:[{nss_id:'student',year:2,hours:3,revision:0}]};
 await call('past-hours',pastCredit,student.cookie,403);
 await call('past-hours',pastCredit,faculty.cookie,403);
 for(const patch of [{confirmNotCounted:false},{confirmNotCounted:'true'},{source:''},{reason:''},{rows:[{...pastCredit.rows[0],hours:5}]},{rows:[{...pastCredit.rows[0],year:1.5}]},{rows:[pastCredit.rows[0],pastCredit.rows[0]]},{rows:[pastCredit.rows[0],{nss_id:'missing',year:1,hours:1,revision:0}]}])await call('past-hours',{...pastCredit,...patch},admin,400);
 assert.equal((await call('past-event?id='+pastId,undefined,admin)).data.participants.length,0);
 await call('past-hours',pastCredit,admin);
 await call('past-hours',pastCredit,admin,409);
 let pastState=(await call('state',undefined,student.cookie)).data;
 assert.equal(pastState.students[0].y1,1);assert.equal(pastState.students[0].y2,3);assert.equal(pastState.counts.hours,4);assert.equal(pastState.counts.participated_events,2);
 const unchanged={...pastCredit,rows:[{...pastCredit.rows[0],revision:1}]};
 await call('past-hours',unchanged,admin);
 assert.equal((await call('past-event?id='+pastId,undefined,admin)).data.history.length,1);
 await call('past-hours',{...unchanged,rows:[{...unchanged.rows[0],year:1}]},admin,400);
 await call('past-hours',{...unchanged,rows:[{...unchanged.rows[0],hours:2}]},admin);
 const history=(await call('records?kind=history',undefined,student.cookie)).data.rows;
 assert(history.some(h=>h.source==='past_event'&&h.delta===-1&&h.year===2));
 assert.equal((await call('past-event?id='+pastId,undefined,student.cookie)).data.participants.length,1);
 await call('past-export?id='+pastId,undefined,student.cookie);
 await call('past-export?id='+pastId,undefined,peer.cookie,403);
 await call('past-export?id='+pastId,undefined,faculty.cookie);
 assert.equal((await call('past-events',undefined,peer.cookie)).data.total,0);
 assert.equal((await call('past-events?q=Past',undefined,faculty.cookie)).data.total,1);
 const reports=(await call('records?kind=reports&q=Past',undefined,admin)).data.rows;assert.equal(reports[0].hours,2);assert.equal(reports[0].source,'past_event');
 await call('print?kind=reports',undefined,admin);
 await call('past-event',{...archived,id:pastId,revision:0,title:'Past campus service amended',reason:'Corrected title'},admin);
 await call('past-event',{...archived,id:pastId,revision:0},admin,409);
 // Two competing edits: only one can credit the same ledger revision.
 const concurrent=await Promise.all([3,4].map(hours=>api.POST(new Request('https://a.example.test/api/past-hours',{method:'POST',headers:{origin:'https://a.example.test',cookie:admin},body:JSON.stringify({...pastCredit,rows:[{...pastCredit.rows[0],revision:2,hours}]})}))));
 assert.equal(concurrent.filter(r=>r.status===200).length,1);checks+=2;
 const afterRace=(await call('past-event?id='+pastId,undefined,admin)).data;
 assert.equal(afterRace.history.length,3);
 await call('past-hours',{...pastCredit,rows:[{...pastCredit.rows[0],revision:3,hours:2}]},admin);
 const guardDb=createClient({url:env.TURSO_DATABASE_URL});
 await assert.rejects(()=>guardDb.execute("UPDATE past_event_hours SET delta=99 WHERE event_id='"+pastId+"'"));
 await assert.rejects(()=>guardDb.execute({sql:'DELETE FROM past_event_hours WHERE event_id=?',args:[pastId]}));
 await assert.rejects(()=>guardDb.execute({sql: "INSERT INTO past_event_hours(id,event_id,user_id,year,delta,balance,revision,source,reason,actor,created_at) VALUES('bad-credit',?,?,2,1,3,5,'register','invalid faculty credit',?,?)",args:[pastId,student.id,faculty.id,new Date(realNow).toISOString()]}));
 assert.equal((await guardDb.execute({sql:'SELECT SUM(delta) hours FROM past_event_hours WHERE event_id=?',args:[pastId]})).rows[0].hours,2);
 guardDb.close();
 assert.equal((await call('system-health',undefined,admin)).data.ok,true);
 // The archived entry does not create, overwrite or fake any live attendance/GPS rows.
 assert.deepEqual((await detail()).original_in,originals[0]);
 // Source migrations rerun without altering accounts, passwords, or hours.
 const rerun=spawnSync(process.execPath,['scripts/migrate.mjs'],{env,encoding:'utf8'});assert.equal(rerun.status,0,rerun.stderr);
 await login('student@example.test');
 assert.equal((await call('state',undefined,student.cookie)).data.counts.hours,3);
 await call('delete-account',{id:student.id,email:'student@example.test',password,reason:'Remove isolated test account'},admin);
 await call('state',undefined,student.cookie,401);
 assert.equal((await call('past-event?id='+pastId,undefined,admin)).data.participants.length,0);
 assert.equal((await call('system-health',undefined,admin)).data.ok,true);
 await call('delete-account',{id:faculty.id,email:'faculty@example.test',password,reason:'Verify archived coordinator reassignment'},admin);
 assert.equal((await call('past-event?id='+pastId,undefined,admin)).data.event.coordinator,(await call('state',undefined,admin)).data.user.id);
 await call('deletion-cleanup',{},admin);assert.equal(blobs.size,0);
 await call('file/'+ticket.id,undefined,admin,400);
 // Import 100 real student accounts atomically into this disposable database.
 const temporary='Disposable-import-only-password-2026';process.env.SEVATRACK_A_IMPORT_PASSWORD=temporary;
 const roster=Array.from({length:100},(_,i)=>({name:'Roster Student '+i,email:'roster'+i+'@example.test',mobile:'98765'+String(i).padStart(5,'0'),nss_id:'BULK'+i,roll:String(i).padStart(3,'0'),department:'Science',batch:'2026',year:i%2+1}));
 await call('import-preview',{rows:roster},peer.cookie,403);
 await call('import',{rows:roster},outsider.cookie,403);
 assert.equal((await call('import-preview',{rows:roster},admin)).data.create,100);
 const bad=[roster[0],{...roster[1],email:roster[0].email}];assert.equal((await call('import-preview',{rows:bad},admin)).data.errors,1);
 await call('import',{rows:bad},admin,400);
 assert.equal((await call('import',{rows:roster},admin)).data.created,100);
 assert.equal((await call('import',{rows:roster},admin)).data.created,0);
 const conflict=[{...roster[0],nss_id:'OTHER-ID'}];await call('import',{rows:conflict},admin,400);
 const loginTemp=await call('auth',{action:'login',email:roster[0].email,password:temporary});
 const tempCookie=loginTemp.response.headers.get('set-cookie').split(';')[0];
 const limited=(await call('state',undefined,tempCookie)).data;assert.equal(limited.passwordChangeRequired,true);assert.equal(limited.students,undefined);
 await call('records?kind=events',undefined,tempCookie,403);await call('past-events',undefined,tempCookie,403);
 await call('change-password',{password:temporary},tempCookie,400);await call('change-password',{password:'short'},tempCookie,400);
 const changed=await call('change-password',{password},tempCookie);const newCookie=changed.response.headers.get('set-cookie').split(';')[0];
 await call('state',undefined,tempCookie,401);
 const studentState=(await call('state',undefined,newCookie)).data;assert.equal(studentState.user.password_change_required,0);assert.equal(studentState.user.mobile,'9876500000');assert.equal(studentState.students[0].roll,'000');
 await call('auth',{action:'login',email:roster[0].email,password:temporary},null,400);
 await call('import',{rows:roster},admin);await login(roster[0].email);
 const bPreview=(await call('import-preview',{rows:[roster[0]]},bAdmin,200,'b.example.test')).data;assert.equal(bPreview.create,1);
 // Volunteer is above Student in role selection, with strictly personal participant access.
 const volunteerId=studentState.user.id;
 const promoteVolunteer={...roster[0],id:volunteerId,role:'VOLUNTEER',active:true,reason:'Appoint NSS volunteer'};
 await call('user',promoteVolunteer,admin);
 const volunteer={id:volunteerId,cookie:await login(roster[0].email)};
 const vState=(await call('state',undefined,volunteer.cookie)).data;assert.equal(vState.user.role,'VOLUNTEER');assert.equal(vState.students.length,1);assert.equal(vState.students[0].id,volunteerId);
 for(const endpoint of ['records?kind=reports','records?kind=audit','system-health','historical-hours?student='+peer.id,'past-event?id='+pastId])await call(endpoint,undefined,volunteer.cookie,403);
 for(const endpoint of ['user','event','review','manual','import','historical-hours','past-hours','past-event','settings','catalog'])await call(endpoint,{},volunteer.cookie,403);
 assert.equal((await call('import-preview',{rows:[roster[0]]},admin)).data.skip,1);
 const owner=(await call('state',undefined,admin)).data.user.id;
 const vEvent={...event,title:'Volunteer workflow',start:new Date(time+600000).toISOString(),end:new Date(time+7200000).toISOString(),deadline:new Date(time+300000).toISOString(),coordinator:owner};
 const veid=(await call('event',vEvent,admin)).data.id;
 await call('register',{event:veid},volunteer.cookie);
 const va=(await call('event-detail?id='+veid,undefined,volunteer.cookie)).data.record.id;
 await call('check',{id:va,kind:'in',location:gps()},volunteer.cookie);
 await call('attendance-detail?id='+va,undefined,peer.cookie,403);
 const vp=(await call('upload-prepare',{attendance:va,mime:'image/png',size:bytes.length,location:gps(),source:'live'},volunteer.cookie)).data;
 blobs.set(process.env.BLOB_READ_WRITE_TOKEN+':'+vp.path,{bytes,mime:'image/png'});await call('upload-finish',{id:vp.id},volunteer.cookie);
 await call('file/'+vp.id,undefined,volunteer.cookie);await call('file/'+vp.id,undefined,peer.cookie,403);
 await call('evidence-review',{id:vp.id,status:'APPROVED',reason:'Volunteer cannot approve own evidence'},volunteer.cookie,403);
 time+=3600000;await call('check',{id:va,kind:'out',location:gps()},volunteer.cookie);
 await call('evidence-review',{id:vp.id,status:'APPROVED',reason:'Verified volunteer evidence'},admin);
 let vr=(await call('attendance-detail?id='+va,undefined,volunteer.cookie)).data.record;
 await call('review',{id:va,revision:vr.revision,status:'APPROVED',hours:1,effective_in:vr.effective_in,effective_out:vr.effective_out,reason:'Verified volunteer service'},admin);
 await call('historical-hours',{reason:'Verified earlier service',source:'Signed register',rows:[{nss_id:'BULK0',year:1,hours:2,revision:0}]},admin);
 await call('past-hours',{event:pastId,source:'Signed register',reason:'Volunteer prior service',confirmNotCounted:true,rows:[{nss_id:'BULK0',year:1,hours:1,revision:0}]},admin);
 const credited=(await call('state',undefined,volunteer.cookie)).data;assert.equal(credited.counts.hours,4);assert.equal(credited.students[0].y1,4);
 const ownHistory=(await call('records?kind=history',undefined,volunteer.cookie)).data.rows;assert(ownHistory.length>=3);assert(ownHistory.every(h=>h.user_id===volunteerId));
 const ownPast=(await call('past-event?id='+pastId,undefined,volunteer.cookie)).data;assert.equal(ownPast.participants.length,1);assert.equal(ownPast.participants[0].user_id,volunteerId);
 await call('user',{...promoteVolunteer,role:'FACULTY'},admin,400);
 await call('user',{...promoteVolunteer,role:'STUDENT'},admin);await call('user',promoteVolunteer,admin);
 await call('delete-account',{id:volunteerId,email:roster[0].email,password,reason:'Verify volunteer account deletion guards'},admin);
 assert.equal((await call('system-health',undefined,admin)).data.ok,true);
 console.log(`${checks} real-handler integration requests passed: login, roles, attendance/GPS, private-photo authorization, original-time audit, hours, exports, persistence, cleanup, archived events/credits, 100-student import, forced password changes, Volunteer role isolation and concurrent college isolation. Blob and GPS hardware were simulated.`);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{fs.rmSync(temp,{recursive:true,force:true})});
