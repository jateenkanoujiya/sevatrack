import {createCipheriv,createDecipheriv,randomBytes,createHash} from 'node:crypto';
export function encryptBackup(bytes,key){
 if(!/^[a-f0-9]{64}$/i.test(key||''))throw new Error('Backup encryption is not configured');
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);
 cipher.setAAD(Buffer.from('sevatrack-backup-v2'));
 const ciphertext=Buffer.concat([cipher.update(bytes),cipher.final()]);
 return Buffer.concat([iv,cipher.getAuthTag(),ciphertext]);
}
export function decryptBackup(bytes,key){
 const cipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),bytes.subarray(0,12));
 cipher.setAAD(Buffer.from('sevatrack-backup-v2'));cipher.setAuthTag(bytes.subarray(12,28));
 return Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]);
}
export const checksum=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function snapshotDatabase(db){
 const tx=await db.transaction('read');
 try{
  const schema=(await tx.execute("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name")).rows.map(r=>({type:r.type,name:r.name,sql:r.sql}));
  const tables=[];
  const encode=v=>typeof v==='bigint'?{$integer:String(v)}:v instanceof ArrayBuffer||ArrayBuffer.isView(v)?{$blob:Buffer.from(v instanceof ArrayBuffer?v:v.buffer,v.byteOffset||0,v.byteLength).toString('base64')}:v;
  for(const item of schema.filter(x=>x.type==='table')){
   const result=await tx.execute('SELECT * FROM "'+item.name.replaceAll('"','""')+'"');
   tables.push({name:item.name,columns:result.columns,rows:result.rows.map(r=>result.columns.map(k=>encode(r[k])))});
  }
  return {format:'sevatrack-backup-v1',createdAt:new Date().toISOString(),schema,tables};
 }finally{await tx.rollback()}
}
