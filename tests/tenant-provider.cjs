const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
class AppError extends Error{constructor(m,status=400){super(m);this.status=status}}
const code=ts.transpileModule(fs.readFileSync('lib/tenant-provider.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function provider(replies,env={}){let calls=[];const out={};vm.runInNewContext(code,{exports:out,require:()=>({AppError}),process:{env:{SEVATRACK_TURSO_API_TOKEN:'test-api-token',SEVATRACK_TURSO_ORGANIZATION:'test-org',SEVATRACK_TURSO_GROUP:'default',...env}},URL,AbortSignal,fetch:async(url,options)=>{calls.push({url,options});const reply=replies.shift();if(reply instanceof Error)throw reply;return reply},Error});return {out,calls}}
(async()=>{
 const made=()=>new Response(JSON.stringify({database:{Hostname:'new-institute-test.turso.io'}})),token=()=>new Response(JSON.stringify({jwt:'scoped-token'}));
 let p=provider([new Response('',{status:404}),made(),token()]);let c=await p.out.createInstituteDatabase('test-id');assert.equal(c.authToken,'scoped-token');assert.equal(p.calls.length,3);assert.equal(JSON.parse(p.calls[1].options.body).group,'default');assert(p.calls[2].url.endsWith('/auth/tokens?authorization=full-access&expiration=never'));
 p=provider([made(),token()]);await p.out.createInstituteDatabase('test-id');assert.equal(p.calls.length,2);assert(!p.calls.some(x=>x.options.body));
 p=provider([new Response('quota exceeded',{status:403})]);await assert.rejects(()=>p.out.createInstituteDatabase('test-id'),/credentials, group and plan limits/);
 p=provider([],{SEVATRACK_TURSO_API_TOKEN:''});await assert.rejects(()=>p.out.createInstituteDatabase('test-id'),/not connected/);assert.equal(p.calls.length,0);
 p=provider([made(),token()],{SEVATRACK_TURSO_API_TOKEN:' \nvalid-token\r\n',SEVATRACK_TURSO_ORGANIZATION:' test-org\n',SEVATRACK_TURSO_GROUP:' default\n'});await p.out.createInstituteDatabase('test-id');assert.equal(p.calls[0].options.headers.Authorization,'Bearer valid-token');assert(p.calls[0].url.includes('/test-org/'));
 for(const bad of ['abc\ndef','abc def','abc\tdef','abc☃','"quoted-token"',"'quoted-token'",'turso config set token abc']){p=provider([],{SEVATRACK_TURSO_API_TOKEN:bad});await assert.rejects(()=>p.out.createInstituteDatabase('test-id'),e=>e.message.includes('contains spaces, line breaks or invalid characters')&&!e.message.includes(bad));assert.equal(p.calls.length,0)}
 p=provider([],{SEVATRACK_TURSO_API_TOKEN:' \n '});await assert.rejects(()=>p.out.createInstituteDatabase('test-id'),/not connected/);
 p=provider([new Response('',{status:401})]);await assert.rejects(()=>p.out.createInstituteDatabase('test-id'),/Turso rejected SEVATRACK_TURSO_API_TOKEN/);
 p=provider([new Error('network failure with secret-token')]);await assert.rejects(()=>p.out.createInstituteDatabase('test-id'),e=>e.message.includes('Could not reach')&&!e.message.includes('secret-token'));
 for(const url of ['http://127.0.0.1','libsql://example.com','libsql://db.turso.io@evil.test','file:/tmp/db','libsql://db.turso.io?token=secret'])assert.throws(()=>p.out.databaseHost(url));
 console.log('Provider contract checks passed: create/retry, database-scoped tokens, quota failures, missing credentials and SSRF rejection. No external databases created.');
})().catch(e=>{console.error(e);process.exitCode=1});
