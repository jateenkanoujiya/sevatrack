'use client';
import {useState} from 'react';
import {suggestedNSSHours} from '@/lib/domain';
const local=(value:string)=>{if(!value)return '';const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
export function AttendanceTimeFields({record,canApprove}:{record:any;canApprove:boolean}){
 const [incoming,setIncoming]=useState(local(record.effective_in)),[outgoing,setOutgoing]=useState(local(record.effective_out));
 const [hours,setHours]=useState(String(suggestedNSSHours(record)??'')),[manual,setManual]=useState(['APPROVED','PARTIAL'].includes(record.status));
 const [confirmZero,setConfirmZero]=useState(false);
 function changeTimes(start:string,end:string){setIncoming(start);setOutgoing(end);if(!manual){setHours(String(suggestedNSSHours({...record,status:'PENDING_REVIEW',effective_in:start,effective_out:end})??''));setConfirmZero(false)}}
 const suggestion=suggestedNSSHours({...record,status:'PENDING_REVIEW',effective_in:incoming,effective_out:outgoing});
 return <>
  <label className="field"><span>Effective check-in</span><input name="effective_in" type="datetime-local" value={incoming} onChange={e=>changeTimes(e.target.value,outgoing)}/></label>
  <label className="field"><span>Effective check-out</span><input name="effective_out" type="datetime-local" value={outgoing} onChange={e=>changeTimes(incoming,e.target.value)}/></label>
  {canApprove&&<label className="field"><span>Final approved NSS hours</span><input name="hours" type="number" min={0} max={24} step="0.01" value={hours} onChange={e=>{setHours(e.target.value);setManual(true);setConfirmZero(false)}}/>
   <small>{suggestion===null?'Set valid check-in and check-out times to calculate hours.':`Duration suggestion: ${suggestion} hours, capped at the event’s expected hours. You can adjust the approved amount.`}</small>
   {suggestion!==null&&<button type="button" className="text-btn" onClick={()=>{setHours(String(suggestion));setManual(false);setConfirmZero(false)}}>Use duration suggestion</button>}
  </label>}
  {canApprove&&hours!==''&&Number(hours)===0&&<label className="field wide"><span className="flex-row"><input type="checkbox" name="confirmZeroHours" checked={confirmZero} onChange={e=>setConfirmZero(e.target.checked)}/>I confirm this approval should credit 0 NSS hours.</span><small>Without hours, the student’s progress will not increase.</small></label>}
 </>;
}
export function BulkHoursFields(){
 const [mode,setMode]=useState('calculated');
 return <><label className="field"><span>Hours to approve</span><select name="hoursMode" value={mode} onChange={e=>setMode(e.target.value)}><option value="calculated">Calculate separately from each student’s attendance</option><option value="custom">Set the same hours for all selected students</option></select><small>Calculated hours use effective duration and the event’s expected hours. Existing approved balances are preserved.</small></label>
 {mode==='custom'&&<label className="field"><span>Approved hours per student</span><input name="hours" type="number" min={0} max={24} step="0.01" placeholder="Enter approved hours"/></label>}
 <label className="field"><span className="flex-row"><input type="checkbox" name="confirmZeroHours"/>Allow approvals that credit 0 NSS hours</span><small>Leave unchecked to flag zero-hour records for individual review.</small></label></>;
}
