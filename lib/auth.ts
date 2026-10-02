import {one,sql,now} from './db';
import {AppError} from './errors';
export const cookie=(r:Request,n:string)=>r.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(n+'='))?.slice(n.length+1);
export async function digest(s:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function passwordHash(password:string,salt=crypto.randomUUID()){if(password.length>128)throw new AppError('Password must be at most 128 characters.');const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);const bytes=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},key,256);return salt+':'+Array.from(new Uint8Array(bytes)).map(x=>x.toString(16).padStart(2,'0')).join('');}
export function constantEqual(a:string,b:string){let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0}
export async function rate(key:string,max=20){const window=Math.floor(Date.now()/900000),k=key+':'+window;const r=await sql('INSERT INTO rate_limits (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',k,new Date(Date.now()+900000).toISOString()).first() as any;if(r.count>max)throw new AppError('Too many attempts. Please try again in 15 minutes.',429);}
export async function context(r:Request){let u:any=null;const token=cookie(r,'seva_session');
 // An expired password session must never silently fall back to another identity.
 if(token){u=await one('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.id=? AND s.expires>?',await digest(token),now());if(!u)throw new AppError('Your session has expired. Please sign in again.',401)}

 if(!u)throw new AppError('Please sign in with an enrolled account to continue.',401);
 if(!u.active)throw new AppError('Your account is deactivated. Contact your NSS administrator.',403);
 return {u,actual:u};
}
export function sessionCookie(name:string,value:string,max=28800){return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${max}`;}
export function safeUser(u:any){const {password,...out}=u;return out;}
