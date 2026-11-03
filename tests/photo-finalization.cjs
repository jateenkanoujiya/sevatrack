const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
class AppError extends Error{constructor(message,status=400){super(message);this.status=status}}
const js=ts.transpileModule(fs.readFileSync('lib/photos.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const exportsObject={};let row;
vm.runInNewContext(js,{exports:exportsObject,require:n=>({'./db':{one:async()=>row},'./errors':{AppError},'./domain':{verifiedAttendanceGPS:()=>true}}[n]||{})});
(async()=>{
 for(const status of ['APPROVED','PARTIAL'])for(const role of ['STUDENT','FACULTY','ADMIN']){
  row={status,user_id:'student',coordinator:'faculty',event_status:'Completed',original_in:'2026-10-03',location_in:'{}'};
  await assert.rejects(exportsObject.photoAttendance({id:role.toLowerCase(),role},'attendance'),e=>e.status===403);
 }
 row={...row,status:'PENDING_REVIEW'};
 await exportsObject.photoAttendance({id:'student',role:'STUDENT'},'attendance');
 await assert.rejects(exportsObject.photoAttendance({id:'someone-else',role:'STUDENT'},'attendance'),e=>e.status===403);
 console.log('8 proof finalization and ownership checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
