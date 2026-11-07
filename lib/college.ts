import {AsyncLocalStorage} from 'node:async_hooks';
import {collegeConfigs} from './college-config.mjs';
import {platformEnabled,resolveInstitute} from './platform-core';
import {AppError} from './errors';

type College = {id:string;url:string;authToken:string;blobToken?:string;name?:string;slug?:string;sharedStorage?:boolean};
const storage = new AsyncLocalStorage<College>();

export function currentCollege():College {
 const college=storage.getStore();
 if(college)return college;
 if(process.env.SEVATRACK_COLLEGES)throw new Error('College request context is required');
 return {id:'default',url:process.env.TURSO_DATABASE_URL||'',authToken:process.env.TURSO_AUTH_TOKEN||'',blobToken:process.env.BLOB_READ_WRITE_TOKEN};
}
export const blobOptions=()=>({token:currentCollege().blobToken});
export function storagePath(path:string){const c=currentCollege();return c.sharedStorage?`institutes/${c.id}/${path}`:path;}

export async function withCollegeRequest(request:Request,handler:()=>Promise<Response>):Promise<Response>{
 let college:College;
 try{
  const entries=collegeConfigs();
  if(!entries.length){
   const selected=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('seva_institute='))?.slice('seva_institute='.length);
   if(selected&&!platformEnabled())throw new AppError('The institute portal is unavailable. Choose your workspace again.',503);
   college=selected?await resolveInstitute(selected):currentCollege();
   const expected=request.headers.get('x-seva-institute');
   if(expected&&expected!==college.id)throw new AppError('Your institute changed in another tab. Reload before continuing.',409);
   return storage.run(college,handler);
  } // Existing host-based configurations remain supported.
  // Never trust a body field, query parameter or x-forwarded-host for selection.
  const host=new URL(request.url).hostname.toLowerCase();
  const selected=entries.find(entry=>entry.hosts.includes(host));
  if(!selected)return Response.json({error:'This address is not configured for a college. Open your college’s SevaTrack link.'},{status:421,headers:{'Cache-Control':'no-store'}});
  college=selected;
 }catch(error){
  return Response.json({error:error instanceof AppError?error.message:'College configuration is unavailable. Please contact your administrator.'},{status:error instanceof AppError?error.status:503,headers:{'Cache-Control':'no-store'}});
 }
 return storage.run(college,handler);
}
