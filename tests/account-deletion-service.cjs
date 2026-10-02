// Mocked service tests: no network, real credentials or production data.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync('lib/account-deletion.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
class AppError extends Error{constructor(m,status=400){super(m);this.status=status}}
function setup(overrides={}){
 const calls=[];
 const db={one:async(q)=>q.includes('COUNT(*) n')?{n:0}:q.includes('SELECT * FROM users')?{id:'admin',role:'ADMIN',active:1,password:'salt:hash'}:q.includes('SELECT id,name')?{id:'student',email:'s@example.test',role:'STUDENT'}:{attendance:1,photos:1,hours:4,events:0},all:async()=>[],sql:(q,...args)=>({run:async()=>{calls.push({q,args})}}),id:()=> 'job',now:()=>new Date().toISOString(),...overrides.db};
 const auth={rate:async()=>{},passwordHash:async(p)=>p==='correct'?'salt:hash':'wrong',constantEqual:(a,b)=>a===b,...overrides.auth};
 const blob={list:async()=>({blobs:[]}),del:async()=>{},...overrides.blob};
 const exports={};vm.runInNewContext(code,{exports,require:n=>({'./db':db,'./auth':auth,'./errors':{AppError},'@vercel/blob':blob}[n]),Date,Error});
 return {service:exports,calls};
}
const admin={id:'admin',role:'ADMIN',active:1};
const body={id:'student',email:'s@example.test',password:'correct',reason:'Requested'};
(async()=>{
 let tested=0;
 for(const u of [{...admin,role:'STUDENT'},{...admin,role:'FACULTY'},{...admin,active:0}]){const t=setup();await assert.rejects(()=>t.service.deleteAccount(u,body));assert.equal(t.calls.length,0);tested++}
 for(const patch of [{password:'wrong'},{email:'other@example.test'},{reason:''},{password:'x'.repeat(129)}]){const t=setup();await assert.rejects(()=>t.service.deleteAccount(admin,{...body,...patch}));assert.equal(t.calls.length,0);tested++}
 {const t=setup();await t.service.deleteAccount(admin,body);assert.equal(t.calls.length,1);assert(t.calls[0].q.startsWith('INSERT INTO account_deletions'));assert(!t.calls[0].args.includes('correct'));tested++}
 const job={id:'job',prefix:'evidence/student/',not_before:'2099-01-01'};
 {const t=setup({db:{all:async()=>[job]}});await t.service.cleanupDeletedPhotos(admin);assert(!t.calls.some(x=>x.q.startsWith('DELETE')));tested++}
 {const t=setup({db:{all:async()=>[{...job,not_before:'2000-01-01'}]}});await t.service.cleanupDeletedPhotos(admin);assert(t.calls.some(x=>x.q.startsWith('DELETE')));tested++}
 {const t=setup({db:{all:async()=>[job]},blob:{list:async()=>{throw Error('private provider details')}}});const r=await t.service.cleanupDeletedPhotos(admin);assert.equal(r.failed,1);assert(t.calls.some(x=>x.q.includes("status='FAILED'")));assert(!r.message.includes('private provider'));tested++}
 {let deletes=0;const t=setup({db:{all:async()=>[job]},blob:{list:async()=>({blobs:[{pathname:'evidence/peer/secret'}]}),del:async()=>deletes++}});await t.service.cleanupDeletedPhotos(admin);assert.equal(deletes,0);tested++}
 {let scans=0;const deleted=[];const t=setup({db:{all:async()=>[job]},blob:{list:async()=>{scans++;return {blobs:[{pathname:'evidence/student/photo'}]}},del:async paths=>deleted.push(...paths)}});await t.service.cleanupDeletedPhotos(admin);assert.equal(scans,3);assert.equal(deleted.length,3);tested++}
 console.log(`${tested} account deletion service checks passed (mocked providers).`);
})().catch(e=>{console.error(e);process.exitCode=1});
