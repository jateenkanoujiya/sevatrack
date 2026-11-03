import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const storeId=token=>/^vercel_blob_rw_([^_]+)_/.exec(token||'')?.[1]?.toLowerCase();
function evidenceFiles(snapshot){
 if(snapshot.format!=='sevatrack-backup-v1')throw new Error('Unsupported database snapshot');
 const table=snapshot.tables.find(t=>t.name==='evidence');
 if(!table)return [];
 const key=table.columns.indexOf('key'),mime=table.columns.indexOf('mime');
 if(key<0||mime<0)throw new Error('Evidence schema is incomplete');
 return table.rows.map(row=>({path:row[key],mime:row[mime]}));
}
export async function packagePhotos(directory,readPhoto,sourceStoreId){
 const bytes=await readFile(join(directory,'database.json'));
 const files=evidenceFiles(JSON.parse(bytes));
 const photos=[];
 await mkdir(join(directory,'photos'),{mode:0o700});
 for(const item of files){
  if(typeof item.path!=='string'||!/^evidence\/[^/]+\/[^/]+$/.test(item.path))throw new Error('Invalid evidence pathname');
  const data=Buffer.from(await readPhoto(item.path));
  if(!data.length||data.length>5*1024*1024)throw new Error('Missing or oversized evidence photo');
  const filename=hash(item.path)+'.bin';
  await writeFile(join(directory,'photos',filename),data,{flag:'wx',mode:0o600});
  photos.push({...item,filename,size:data.length,sha256:hash(data)});
 }
 // Write the manifest LAST: an incomplete download must never look like a backup.
 const manifest={format:'sevatrack-full-backup-v1',createdAt:new Date().toISOString(),sourceStoreId,databaseSha256:hash(bytes),photos};
 await writeFile(join(directory,'manifest.json'),JSON.stringify(manifest),{flag:'wx',mode:0o600});
 return manifest;
}
export async function verifyBackup(directory){
 const manifest=JSON.parse(await readFile(join(directory,'manifest.json'),'utf8'));
 if(manifest.format!=='sevatrack-full-backup-v1'||!Array.isArray(manifest.photos))throw new Error('Unsupported backup manifest');
 const bytes=await readFile(join(directory,'database.json'));
 if(hash(bytes)!==manifest.databaseSha256)throw new Error('Database checksum mismatch');
 const expected=evidenceFiles(JSON.parse(bytes));
 if(expected.length!==manifest.photos.length)throw new Error('Photo count does not match database');
 const paths=new Set();
 for(const p of manifest.photos){
  if(typeof p.path!=='string'||paths.has(p.path)||p.filename!==hash(p.path)+'.bin'||!expected.some(x=>x.path===p.path&&x.mime===p.mime))throw new Error('Photo manifest does not match database');
  paths.add(p.path);
  const data=await readFile(join(directory,'photos',p.filename));
  if(data.length!==p.size||hash(data)!==p.sha256)throw new Error('Photo checksum mismatch');
 }
 return manifest;
}
