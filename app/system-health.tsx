'use client';
import {useState} from 'react';
import {CheckCircle2,TriangleAlert,LoaderCircle,ShieldCheck} from 'lucide-react';
type Result={checkedAt:string;release:string;ok:boolean;checks:{label:string;ok:boolean}[];scope:string};
export default function SystemHealth(){
 const [result,setResult]=useState<Result|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function check(){
  setBusy(true);setError('');setResult(null);
  try{
   const response=await fetch('/api/system-health',{cache:'no-store'});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||'Checks could not finish. Try again.');
   setResult(data);
  }catch(e){setError(e instanceof Error?e.message:'Unable to connect. Please try again.')}
  finally{setBusy(false)}
 }
 return <section className="panel" style={{marginTop:24}} aria-labelledby="system-health-title">
  <div className="panel-head"><h2 id="system-health-title">System health</h2><ShieldCheck size={19}/></div>
  <div className="panel-body">
   <p className="muted">Check database migrations, approved hours and account cleanup without changing records.</p>
   <button type="button" className="btn" style={{marginTop:12}} disabled={busy} onClick={check}>{busy?<LoaderCircle size={16} className="animate-spin"/>:<ShieldCheck size={16}/>} {busy?'Checking…':'Run system checks'}</button>
   <div aria-live="polite" aria-busy={busy}>
    {error&&<p role="alert" className="info-strip" style={{marginTop:16}}>{error}</p>}
    {result&&<div style={{marginTop:16}}><p><strong>{result.ok?'All database checks passed':'Some checks need attention'}</strong> · {new Date(result.checkedAt).toLocaleString()}</p>
     <ul className="health-results">{result.checks.map(c=><li key={c.label}>{c.ok?<CheckCircle2 size={18} aria-hidden="true"/>:<TriangleAlert size={18} aria-hidden="true"/>}<span><strong>{c.ok?'Passed':'Needs attention'}</strong> — {c.label}</span></li>)}</ul>
     <p className="help-note">{result.scope}</p>
    </div>}
   </div>
  </div>
 </section>;
}
