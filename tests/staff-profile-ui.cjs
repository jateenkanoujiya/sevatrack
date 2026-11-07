const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const exportsForTest={};
const stub=new Proxy({}, {get:(_,name)=>({children,...props})=>React.createElement('div',{'data-component':String(name)},children)});
const source=fs.readFileSync('app/seva-app.tsx','utf8')+'\nexport {ModalBody as TestAccountModal};';
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsForTest,require:n=>n==='react'||n==='react/jsx-runtime'||n==='react-dom'?require(n):stub,Date,Math,Number,console});
for(const role of ['SUPER_ADMIN','ADMIN','FACULTY','STUDENT','VOLUNTEER']){
 const person={id:'target',name:'Person',email:'person@example.test',role,department:'Science',batch:'2026',year:1,active:1};
 const html=renderToStaticMarkup(React.createElement(exportsForTest.TestAccountModal,{modal:{kind:'user-form',person},data:{user:{id:'actor',role:'ADMIN'},catalogs:[]},busy:false}));
 for(const label of ['NSS batch','Current NSS year','NSS ID','Roll number']){
  assert.equal(html.includes('>'+label+'<'),['STUDENT','VOLUNTEER'].includes(role),role+': '+label);
 }
 assert.match(html,/Full name/);assert.match(html,/Email/);assert.match(html,/Department/);
}
console.log('Real React account form renders student fields only for Student and Volunteer.');
