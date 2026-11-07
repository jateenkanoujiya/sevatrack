import {platformRequest} from '@/lib/platform';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
async function handler(r:Request,{params}: {params:Promise<{action:string}>}){return platformRequest(r,(await params).action)}
export {handler as GET,handler as POST};
