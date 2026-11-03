import {AsyncLocalStorage} from 'node:async_hooks';
import {collegeConfigs} from './college-config.mjs';

type College = {id:string;url:string;authToken:string;blobToken?:string};
const storage = new AsyncLocalStorage<College>();

export function currentCollege():College {
 const college=storage.getStore();
 if(college)return college;
 if(process.env.SEVATRACK_COLLEGES)throw new Error('College request context is required');
 return {id:'default',url:process.env.TURSO_DATABASE_URL||'',authToken:process.env.TURSO_AUTH_TOKEN||'',blobToken:process.env.BLOB_READ_WRITE_TOKEN};
}
export const blobOptions=()=>({token:currentCollege().blobToken});

export async function withCollegeRequest(request:Request,handler:()=>Promise<Response>):Promise<Response>{
 let college:College;
 try{
  const entries=collegeConfigs();
  if(!entries.length)return await handler(); // Existing single-college installation.
  // Never trust a body field, query parameter or x-forwarded-host for selection.
  const host=new URL(request.url).hostname.toLowerCase();
  const selected=entries.find(entry=>entry.hosts.includes(host));
  if(!selected)return Response.json({error:'This address is not configured for a college. Open your college’s SevaTrack link.'},{status:421,headers:{'Cache-Control':'no-store'}});
  college=selected;
 }catch{
  return Response.json({error:'College configuration is unavailable. Please contact your administrator.'},{status:503,headers:{'Cache-Control':'no-store'}});
 }
 return storage.run(college,handler);
}
