import {createClient,type Client,type InValue} from '@libsql/client';
import {openTenant} from './tenant-secrets.mjs';
import {AppError} from './errors';
let cached:{url:string;token:string;client:Client}|undefined;
export const platformEnabled=()=>process.env.SEVATRACK_PLATFORM_ENABLED==='1';
export function platformDB(){
 const url=process.env.TURSO_DATABASE_URL||'',token=process.env.TURSO_AUTH_TOKEN||'';
 if(!url||!token)throw new AppError('The institute portal is unavailable. Please try later.',503);
 if(!cached||cached.url!==url||cached.token!==token)cached={url,token,client:createClient({url,authToken:token,intMode:'number'})};
 return cached.client;
}
export async function platformQuery(sql:string,...args:InValue[]){return platformDB().execute({sql,args})}
export async function platformOne(sql:string,...args:InValue[]){return (await platformQuery(sql,...args)).rows[0] as any}
export async function resolveInstitute(id:string){
 if(!/^[a-f0-9-]{36}$/.test(id))throw new AppError('Choose your institute again.',421);
 const row=await platformOne("SELECT id,slug,name,status,credentials FROM platform_institutes WHERE id=?",id);
 if(!row||row.status!=='ACTIVE'||!row.credentials)throw new AppError('This institute is not active. Contact the platform owner.',403);
 const connection=openTenant(row.id,row.credentials);
 return {id:'institute-'+row.id,name:row.name,slug:row.slug,url:connection.url,authToken:connection.authToken,blobToken:process.env.BLOB_READ_WRITE_TOKEN,sharedStorage:true};
}
export async function protectPlatformOwner(actor:{id:string},target:string){
 if(!platformEnabled())return;
 const owner=await platformOne('SELECT user_id FROM platform_owner WHERE singleton=1');
 if(owner?.user_id===target&&actor.id!==target)throw new AppError('Only the platform owner can change this account.',403);
}
