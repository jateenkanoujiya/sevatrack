const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function load(file,deps){const x={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,{exports:x,require:n=>deps[n]||require(n),Date,Math,Number});return x}
const domain=load('lib/domain.ts',{'./errors':{AppError:Error}}),ui=load('app/attendance-hours-fields.tsx',{'@/lib/domain':domain});
const record={id:'record',status:'PENDING_REVIEW',approved_hours:0,effective_in:'2026-11-03T08:00:00Z',effective_out:'2026-11-03T10:00:00Z',event_hours:3};
const render=(r,canApprove=true)=>renderToStaticMarkup(React.createElement(ui.AttendanceTimeFields,{record:r,canApprove}));
assert.match(render(record),/name="hours"[^>]*value="2"/);
assert.doesNotMatch(render(record),/confirmZeroHours/);
assert.match(render({...record,status:'APPROVED',approved_hours:0}),/confirmZeroHours/);
assert.match(render({...record,status:'APPROVED',approved_hours:1.25}),/name="hours"[^>]*value="1.25"/);
assert.doesNotMatch(render(record,false),/name="hours"/);
const bulk=renderToStaticMarkup(React.createElement(ui.BulkHoursFields));assert.match(bulk,/value="calculated" selected/);assert.doesNotMatch(bulk,/name="hours"/);
console.log('Approval form initial values and bulk calculation mode passed with real React rendering.');
