const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),ts=require('typescript');
class AppError extends Error{}
const exportsObject={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/domain.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exportsObject,require:()=>({AppError}),Date,Math,Number,JSON});
const {attendanceGPS,verifiedAttendanceGPS}=exportsObject,clock=Date.parse('2026-10-03T12:00:00Z'),event={lat:19,lng:72,radius:100},valid={lat:19,lng:72,accuracy:8,clientTime:new Date(clock).toISOString()};
for(const location of [null,{denied:true},{...valid,lat:20},{...valid,accuracy:80},{...valid,accuracy:0},{...valid,clientTime:undefined},{...valid,clientTime:new Date(clock-120001).toISOString()},{...valid,clientTime:new Date(clock+30001).toISOString()}])assert.throws(()=>attendanceGPS(location,event,clock));
const loc=attendanceGPS(valid,event,clock);assert.equal(loc.verified,true);assert.equal(verifiedAttendanceGPS(JSON.stringify(loc),event),true);
assert.equal(verifiedAttendanceGPS('{bad json',event),false);
assert.equal(verifiedAttendanceGPS({...loc,inside:false},event),false);
assert.equal(verifiedAttendanceGPS({...loc,accuracy:101},event),false);
assert.equal(verifiedAttendanceGPS({...loc,lat:20},event),false);
assert.throws(()=>attendanceGPS({...valid,lat:19.00085,accuracy:10},event,clock));
assert.throws(()=>attendanceGPS({...valid,accuracy:8},{...event,radius:10},clock));
console.log('16 GPS gate checks passed.');
