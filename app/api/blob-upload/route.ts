import {handleUpload,type HandleUploadBody} from '@vercel/blob/client';
import {context,rate} from '@/lib/auth';
import {authorizePhoto} from '@/lib/photos';
import {AppError,boundedBody} from '@/lib/errors';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 try{
  const body=JSON.parse(new TextDecoder().decode(await boundedBody(request,16384))) as HandleUploadBody;
  const response=await handleUpload({body,request,onBeforeGenerateToken:async(pathname:string,clientPayload:string|null)=>{
   const origin=request.headers.get('origin');
   if((origin&&origin!==new URL(request.url).origin)||request.headers.get('sec-fetch-site')==='cross-site')throw new AppError('Cross-origin upload is not authorized.',403);
   const {u}=await context(request);await rate('photo-token-'+u.id,30);
   const ticket=await authorizePhoto(u,String(clientPayload),pathname);
   return {allowedContentTypes:[ticket.mime],maximumSizeInBytes:ticket.size,validUntil:Date.now()+600000,addRandomSuffix:false,allowOverwrite:false,tokenPayload:ticket.id};
  },onUploadCompleted:async()=>{/* The authenticated finalize endpoint validates bytes before publishing evidence. */}});
  return Response.json(response,{headers:{'Cache-Control':'no-store'}});
 }catch(error){return Response.json({error:error instanceof AppError?error.message:'Could not authorize this photo upload. Please try again.'},{status:error instanceof AppError?error.status:400,headers:{'Cache-Control':'no-store'}});}
}
