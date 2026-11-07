import {AppError} from './errors';

export function requireSuperAdmin(user:any){
 if(user.role!=='SUPER_ADMIN'||!user.active)throw new AppError('Only your institute Super Admin or the platform owner can manage institute settings.',403);
}
export async function protectAccount(actor:any,target:any,desiredRole?:string){
 if(target?.owner_proxy)throw new AppError('Platform owner access cannot be changed from an institute account.',403);
 if(target?.role==='SUPER_ADMIN'&&target.id!==actor.id&&!actor.isPlatformOwner)throw new AppError('Only the platform owner can manage another Super Admin account.',403);
 if(desiredRole==='SUPER_ADMIN'&&target?.role!=='SUPER_ADMIN'&&!actor.isPlatformOwner)throw new AppError('Only the platform owner can appoint an institute Super Admin.',403);
 if(actor.role==='ADMIN'&&(['ADMIN','SUPER_ADMIN'].includes(target?.role)||['ADMIN','SUPER_ADMIN'].includes(desiredRole||'')))throw new AppError('Only the institute Super Admin can manage administrator accounts.',403);
}
