import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'SevaTrack — NSS Activity & Service Hours',description:'Every act of service, accounted for. NSS events, attendance, evidence and two-year service hours.',icons:{icon:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en" suppressHydrationWarning><body>{children}</body></html>}
