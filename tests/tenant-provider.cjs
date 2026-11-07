const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
class AppError extends Error{constructor(m,status=400){super(m);this.status=status}}
const code=ts.transpileModule(fs.readFileSync('lib/tenant-provider.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function provider(replies,env={}){let calls=[];const out={};vm.runInNewContext(code,{exports:out,require:()=>({AppError}),process:{env:{SEVATRACK_TURSO_API_TOKEN:'test-api-token',SEVATRACK_TURSO_ORGANIZATION:'test-org',SEVATRACK_TURSO_GROUP:'default',...env}},URL,AbortSignal,fetch:async(url,options)=>{calls.push({url,options});return replies.shift()},Error});return {out,calls}}
(async()=>{
 const made=()=>new Response(JSON.stringify({database:{Hostname:'new-institute-test.turso.io'}})),token=()=>new Response(JSON.stringify({jwt:'scoped-token'}));
 let p=provider([new Response('',{status:404}),made(),token()]);let c=await p.out.createInstituteDatabase('test-id');assert.equal(c.authToken,'scoped-token');assert.equal(p.calls.length,3);assert.equal(JSON.parse(p.calls[1].options.body).group,'default');assert(p.calls[2].url.endsWith('/auth/tokens?authorization=full-access&expiration=never'));
 p=provider([made(),token()]);await p.out.createInstituteDatabase('test-id');assert.equal(p.calls.length,2);assert(!p.calls.some(x=>x.options.body));
 p=provider([new Response('quota exceeded',{status:403})]);await assert.rejects(()=>p.out.createInstituteDatabase('test-id'),/credentials, group and plan limits/);
 p=provider([],{SEVATRACK_TURSO_API_TOKEN:''});await assert.rejects(()=>p.out.createInstituteDatabase('test-id'),/not connected/);assert.equal(p.calls.length,0);
 for(const url of ['http://127.0.0.1','libsql://example.com','libsql://db.turso.io@evil.test','file:/tmp/db','libsql://db.turso.io?token=secret'])assert.throws(()=>p.out.databaseHost(url));
 console.log('Provider contract checks passed: create/retry, database-scoped tokens, quota failures, missing credentials and SSRF rejection. No external databases created.');
})().catch(e=>{console.error(e);process.exitCode=1});
