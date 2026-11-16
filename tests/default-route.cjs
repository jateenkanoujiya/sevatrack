const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const source=fs.readFileSync('app/[[...path]]/page.tsx','utf8');
async function route(env,values={}){
 const exports={};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
  exports,process:{env},require(name){
   if(name==='next/headers')return {cookies:async()=>({get:key=>values[key]===undefined?undefined:{value:values[key]}})};
   if(name==='next/navigation')return {redirect:target=>{throw new Error('redirect:'+target)}};
   if(name==='react/jsx-runtime')return {jsx:()=> 'workspace'};
   if(name==='../seva-app')return {default:()=>null};
   throw new Error(name);
  }
 });
 return exports.default();
}
(async()=>{
 const enabled={SEVATRACK_PLATFORM_ENABLED:'1'};
 await assert.rejects(route(enabled),/redirect:\/institutes/);
 await assert.rejects(route(enabled,{seva_institute:'',seva_session:'legacy-session'}),/redirect:\/institutes/);
 assert.equal(await route(enabled,{seva_institute:'selected-institute'}),'workspace');
 await assert.rejects(route(enabled,{seva_owner_access:'old-owner-grant'}),/redirect:\/institutes/);
 assert.equal(await route(enabled,{seva_institute:'selected-institute',seva_owner_access:'owner-grant'}),'workspace');
 assert.equal(await route({}),'workspace');
 assert.equal(await route({...enabled,SEVATRACK_COLLEGES:'configured'}),'workspace');
 console.log('Default route: 7 cases passed');
})().catch(e=>{console.error(e);process.exitCode=1});
