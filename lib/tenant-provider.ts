import {AppError} from './errors';
export const automaticProvisioningReady=()=>!!(process.env.SEVATRACK_TURSO_API_TOKEN?.trim()&&process.env.SEVATRACK_TURSO_ORGANIZATION?.trim()&&process.env.SEVATRACK_TURSO_GROUP?.trim());
export function databaseHost(url:string){
 let parsed:URL;try{parsed=new URL(url)}catch{throw new AppError('Enter a valid Turso database URL.')}
 if(process.env.NODE_ENV==='test'&&process.env.SEVATRACK_TEST_TENANTS==='1'&&parsed.protocol==='file:')return url;
 if(parsed.protocol!=='libsql:'||!/^([a-z0-9-]+\.)+turso\.io$/.test(parsed.hostname)||parsed.username||parsed.password||parsed.port||parsed.search||parsed.hash||!['','/'].includes(parsed.pathname))throw new AppError('Use a new Turso database with a libsql://…turso.io URL.');
 return parsed.hostname;
}
export async function createInstituteDatabase(id:string){
 if(!automaticProvisioningReady())throw new AppError('Automatic database setup is not connected. Configure the Turso organization API credentials, or attach a new empty database.',503);
 const apiToken=process.env.SEVATRACK_TURSO_API_TOKEN!.trim();
 // Do not silently rewrite a damaged credential or expose it in fetch errors.
 if(!/^[\x21-\x7e]+$/.test(apiToken)||/["']/.test(apiToken))throw new AppError('SEVATRACK_TURSO_API_TOKEN contains spaces, line breaks or invalid characters. In Vercel, replace it with only the Turso API token (no command or quotes), redeploy, then retry setup.',503);
 const org=encodeURIComponent(process.env.SEVATRACK_TURSO_ORGANIZATION!.trim()),name='seva-'+id.replaceAll('-','');
 const base='https://api.turso.tech/v1/organizations/'+org+'/databases';
 const headers={Authorization:'Bearer '+apiToken,'Content-Type':'application/json'};
 async function send(url:string,init:RequestInit={}){
  let response:Response;
  try{response=await fetch(url,{...init,headers,signal:AbortSignal.timeout(20000),redirect:'error'})}
  catch{throw new AppError('Could not reach the Turso database provider. Check the connection and retry setup.',503)}
  if(response.status===401)throw new AppError('Turso rejected SEVATRACK_TURSO_API_TOKEN. Replace it with a valid Turso API token in Vercel, redeploy, then retry setup.',503);
  return response;
 }
 let response=await send(base+'/'+name);
 if(response.status===404)response=await send(base,{method:'POST',body:JSON.stringify({name,group:process.env.SEVATRACK_TURSO_GROUP!.trim()})});
 if(!response.ok)throw new AppError('Database provider could not create the institute database. Check credentials, group and plan limits, then retry.',503);
 const data=await response.json(),host=data.database?.Hostname||data.database?.hostname;
 const url='libsql://'+host;databaseHost(url);
 const token=await send(base+'/'+name+'/auth/tokens?authorization=full-access&expiration=never',{method:'POST'});
 if(!token.ok)throw new AppError('Database created, but its access token could not be issued. Check provider permissions and retry.',503);
 const {jwt}=await token.json();if(typeof jwt!=='string'||!jwt)throw new AppError('The database provider returned an invalid token.',503);
 return {url,authToken:jwt};
}
