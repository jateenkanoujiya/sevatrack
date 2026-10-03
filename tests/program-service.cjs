const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
class AppError extends Error{constructor(m,status=400){super(m);this.status=status}}
function load(file,deps,extra={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>deps[n],Date,Error,Buffer,...extra});return exports;}
const domain=load('lib/domain.ts',{'./errors':{AppError}});
const meta=load('lib/photo-metadata.ts',{'./errors':{AppError},'./domain':domain});
function setup(){const writes=[];let sequence=0;const db={all:async()=>[{id:'student',nss_id:'NSS1',year:1,hours:12,revision:1}],one:async q=>q.includes('SELECT id,name')?{id:'student',name:'Student'}:q.includes('SUM(delta)')?{hours:12,revision:1}:{id:'student'},id:()=>String(++sequence),now:()=>new Date().toISOString(),insert:(table,data)=>({table,data}),audit:(...data)=>({audit:data}),notice:(...data)=>({notice:data}),db:()=>({batch:async q=>writes.push(...q)})};return {service:load('lib/historical-hours.ts',{'./errors':{AppError},'./db':db}),writes};}
(async()=>{
 let checks=0;const admin={id:'admin',role:'ADMIN',active:1},faculty={id:'faculty',role:'FACULTY',active:1};const {service}=setup();
 assert.equal(service.canEditHistorical(faculty,Date.parse('2026-10-07T18:29:59.999Z')),true);checks++;
 assert.equal(service.canEditHistorical(faculty,Date.parse('2026-10-07T18:30:00.000Z')),false);checks++;
 assert.equal(service.canEditHistorical(admin,Date.parse('2030-01-01')),true);checks++;
 for(const u of [{...admin,active:0},{...admin,role:'STUDENT'}]){const t=setup();await assert.rejects(()=>t.service.saveHistorical(u,{}));assert.equal(t.writes.length,0);checks++}
 const valid={reason:'Verified logbook',source:'Signed register page 4',rows:[{nss_id:'NSS1',year:1,hours:14,revision:1}]};
 for(const patch of [{reason:''},{source:''},{rows:[{...valid.rows[0],revision:0}]},{rows:[valid.rows[0],valid.rows[0]]},{rows:[{...valid.rows[0],hours:''}]},{rows:[{...valid.rows[0],hours:-1}]},{rows:[{...valid.rows[0],hours:2.001}]},{rows:[{...valid.rows[0],year:3}]}]){const t=setup();await assert.rejects(()=>t.service.saveHistorical(admin,{...valid,...patch}));assert.equal(t.writes.length,0);checks++}
 {const t=setup();await t.service.saveHistorical(admin,valid);assert.equal(t.writes.length,3);assert.equal(t.writes[0].data.delta,2);assert.equal(t.writes[0].data.balance,14);assert.equal(t.writes[0].data.revision,2);checks++}
 {const t=setup();await t.service.saveHistorical(admin,{...valid,rows:[{...valid.rows[0],hours:12}]});assert.equal(t.writes.length,0);checks++}
 await assert.rejects(()=>service.historicalBalances({id:'s1',role:'STUDENT'},'s2'));checks++;
 const event={lat:19,lng:72,radius:100},proof={source:'geotag-app',location:{denied:true},capture:{app:'GPS Camera',lat:19,lng:72,time:'2026-01-01T10:00:00Z'}};
 {const r=meta.photoMetadata(proof,event);assert.equal(r.denied,true);assert.equal(r.declaredCapture.verified,false);assert.equal(r.declaredCapture.distance,0);checks++}
 {const r=meta.photoMetadata({...proof,location:{lat:20,lng:72,accuracy:5}},event);assert.equal(r.lat,20);assert.equal(r.declaredCapture.lat,19);assert.equal(r.inside,false);checks++}
 for(const capture of [{...proof.capture,lat:''},{...proof.capture,lng:181},{...proof.capture,time:'3000-01-01'},{...proof.capture,app:''}]){assert.throws(()=>meta.photoMetadata({...proof,capture},event));checks++}
 assert.throws(()=>meta.photoMetadata({...proof,source:'verified'},event));checks++;
 const uploads=load('lib/uploads.ts',{'./errors':{AppError}}),branding=load('lib/branding.ts',{'./errors':{AppError},'./uploads':uploads});
 for(const value of ['https://example.com/logo.svg','data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,bm90YW5pbWFnZQ==']){assert.throws(()=>branding.collegeLogo(value));checks++}
 assert.equal(branding.collegeLogo(''),null);checks++;
 console.log(`${checks} program update service checks passed (mocked database; real validation).`);
})().catch(e=>{console.error(e);process.exitCode=1});
