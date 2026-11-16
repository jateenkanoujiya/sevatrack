import {timingSafeEqual} from 'node:crypto';
import {runOperationalBackup} from '@/lib/platform-operations';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function GET(request:Request){
 const secret=process.env.CRON_SECRET,provided=request.headers.get('authorization')||'';
 const expected='Bearer '+secret;
 if(!secret||Buffer.byteLength(provided)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(provided),Buffer.from(expected)))return Response.json({error:'Unauthorized'},{status:401});
 try{const result=await runOperationalBackup('scheduled-backup');return Response.json(result,{status:result.results.some(r=>!r.ok)?503:200})}
 catch{return Response.json({error:'Backup failed. Review configuration and institute connectivity.'},{status:503})}
}
