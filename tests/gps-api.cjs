// Exercise actual route handlers with an isolated database adapter, no network.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),ts=require('typescript');
class AppError extends Error{constructor(m,status=400){super(m);this.status=status}}
function compiled(file,deps){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>deps[n]||{},Date,Math,Number,JSON,Request,Response,URL,URLSearchParams,TextDecoder,console});return exports;}
const domain=compiled('lib/domain.ts',{'./errors':{AppError}});
function setup(patch={}){
 const writes=[],user={id:'admin',role:'ADMIN',active:1,...patch.user},now=new Date().toISOString(),gps=JSON.stringify({lat:19,lng:72,accuracy:8,inside:true,status:'Location verified'}),event={id:'event',coordinator:'faculty',title:'Service',status:'Ongoing',start:new Date(Date.now()-3600000).toISOString(),end:new Date(Date.now()+3600000).toISOString(),lat:19,lng:72,radius:100,proof:1},record={id:'attendance',event_id:'event',user_id:'student',year:1,status:'PENDING_REVIEW',original_in:new Date(Date.now()-3600000).toISOString(),original_out:now,effective_in:new Date(Date.now()-3600000).toISOString(),effective_out:now,location_in:gps,location_out:gps,revision:2,...patch.record};
 const db={one:async(q)=>q.includes('FROM attendance WHERE id')?record:q.includes('FROM events WHERE id')?event:q.includes("FROM evidence WHERE attendance_id")?(patch.proof===false?null:{id:'photo'}):q.includes('SUM(delta)')?{total:0}:null,sql:(q,...args)=>({q,args,run:async()=>writes.push({q,args})}),insert:(table,data)=>({table,data}),audit:(...a)=>({audit:a}),notice:(...a)=>({notice:a}),now:()=>now,id:()=>String(writes.length),db:()=>({batch:async q=>writes.push(...q)})};
 const route=compiled('app/api/[...path]/route.ts',{'@/lib/db':db,'@/lib/auth':{context:async()=>({u:user,actual:user}),rate:async()=>{}},'@/lib/domain':domain,'@/lib/errors':{AppError,boundedBody:async r=>new Uint8Array(await r.arrayBuffer())}});
 return {writes,record,call:async(path,body)=>{const r=await route.POST(new Request('https://test.invalid/api/'+path,{method:'POST',headers:{origin:'https://test.invalid','content-type':'application/json'},body:JSON.stringify(body)}));return {status:r.status,data:await r.json()}}};
}
(async()=>{
 let count=0;
 const body={id:'attendance',revision:2,status:'APPROVED',hours:1,effective_in:new Date(Date.now()-3600000).toISOString(),effective_out:new Date().toISOString(),reason:'GPS and image reviewed'};
 for(const patch of [{user:{id:'student',role:'STUDENT'}},{user:{id:'faculty',role:'FACULTY'}}]){const s=setup(patch),r=await s.call('review',body);assert.equal(r.status,403);assert.equal(s.writes.length,0);count++}
 for(const patch of [{record:{location_in:null}},{record:{location_out:null}},{record:{original_out:null}},{record:{location_in:JSON.stringify({inside:false,status:'Location outside event area'})}},{proof:false}]){const s=setup(patch),r=await s.call('review',{...body,proofOverride:true});assert.equal(r.status,400);assert.equal(s.writes.length,0);count++}
 {const s=setup(),r=await s.call('review',body);assert.equal(r.status,200);const l=s.writes.find(x=>x.table==='hour_ledger');assert.equal(l.data.delta,1);assert.equal(l.data.actor,'admin');assert(!s.writes.some(x=>x.q?.includes('SET original_in')));count++}
 {const s=setup({user:{id:'faculty',role:'FACULTY'}}),r=await s.call('review',{...body,status:'PENDING_REVIEW'});assert.equal(r.status,200);assert.equal(s.writes.find(x=>x.table==='hour_ledger').data.delta,0);count++}
 {const s=setup({user:{id:'faculty',role:'FACULTY'},record:{status:'APPROVED'}}),r=await s.call('review',{...body,status:'PENDING_REVIEW'});assert.equal(r.status,403);count++}
 const valid={lat:19,lng:72,accuracy:8,clientTime:new Date().toISOString()};
 for(const location of [{denied:true},{...valid,lat:20},{...valid,accuracy:80},{...valid,clientTime:'2000-01-01'}]){const s=setup({user:{id:'student',role:'STUDENT'},record:{status:'REGISTERED',original_in:null}}),r=await s.call('check',{id:'attendance',kind:'in',location});assert.equal(r.status,400);assert.equal(s.writes.length,0);count++}
 {const s=setup({user:{id:'student',role:'STUDENT'},record:{status:'REGISTERED',original_in:null}}),r=await s.call('check',{id:'attendance',kind:'in',location:valid});assert.equal(r.status,200);assert.equal(JSON.parse(s.writes[0].args[2]).verified,true);assert(!s.writes.some(x=>x.table==='hour_ledger'));count++}
 console.log(`${count} actual API-handler checks passed with mocked database.`);
})().catch(e=>{console.error(e);process.exitCode=1});
