import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import SevaApp from '../seva-app';

export const dynamic='force-dynamic';
export default async function Page(){
 // Keep host-based installations and explicitly selected workspaces working.
 // Cookies select the UI only; API handlers still validate tenant and owner access.
 if(process.env.SEVATRACK_PLATFORM_ENABLED==='1'&&!process.env.SEVATRACK_COLLEGES){
  const jar=await cookies();
  if(!jar.get('seva_institute')?.value&&!jar.get('seva_owner_access')?.value){
   redirect('/institutes');
  }
 }
 return <SevaApp/>;
}
