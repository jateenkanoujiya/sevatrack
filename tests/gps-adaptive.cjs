const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
class AppError extends Error{}
const x={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/domain.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:x,require:()=>({AppError}),Date,Math,Number,JSON});
const clock=Date.now(),event={lat:19,lng:72,radius:250},reading={lat:19+94/111195,lng:72,accuracy:149,clientTime:new Date(clock).toISOString()};
const accepted=x.attendanceGPS(reading,event,clock);
assert.equal(accepted.distance,94);assert.equal(accepted.status,'Location verified');assert.equal(accepted.verification,'EVENT_GEOFENCE_V2');assert(x.verifiedAttendanceGPS(JSON.stringify(accepted),event));
assert.throws(()=>x.attendanceGPS({...reading,accuracy:160},event,clock)); // uncertainty crosses boundary
assert.throws(()=>x.attendanceGPS({...reading,lat:19+260/111195,accuracy:5},event,clock)); // outside
assert.throws(()=>x.attendanceGPS({...reading,lat:19,accuracy:201},{...event,radius:1000},clock)); // coarse location
assert.throws(()=>x.attendanceGPS({...reading,clientTime:new Date(clock-120001).toISOString()},event,clock));
assert.throws(()=>x.attendanceGPS({denied:true},event,clock));
assert(!x.verifiedAttendanceGPS({...accepted,verification:'EVENT_GEOFENCE_V1'},event)); // never reinterpret old records
assert(!x.verifiedAttendanceGPS({...accepted,verification:undefined},event));
assert(!x.verifiedAttendanceGPS({...accepted,radius:null,eventLat:NaN},event));
const precise=x.attendanceGPS({...reading,lat:19,accuracy:8},{...event,radius:10},clock);assert(x.verifiedAttendanceGPS(precise,event));
console.log('12 adaptive GPS checks passed, including 94m + 149m within 250m, approval validation, stale/outside rejection and legacy policy preservation.');
