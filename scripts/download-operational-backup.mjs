// Download and verify ONE encrypted recovery point into a NEW private directory.
import {get} from '@vercel/blob';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {decryptBackup,checksum} from '../lib/operational-backup.mjs';
import {verifyBackup,storeId} from '../lib/backup-files.mjs';
const [manifestPath,output]=process.argv.slice(2),key=process.env.SEVATRACK_BACKUP_KEY,token=process.env.BLOB_READ_WRITE_TOKEN;
if(!manifestPath?.startsWith('backups/v2/')||!manifestPath.endsWith('/manifest.enc')||!output||!key||!token)throw new Error('Supply a backup manifest pathname, new output directory and private backup credentials.');
const prefix=manifestPath.slice(0,-'manifest.enc'.length);
async function read(path){
 if(!path.startsWith(prefix)||path.includes('..'))throw new Error('Unexpected backup pathname');
 const result=await get(path,{access:'private',token,useCache:false});
 if(!result||result.statusCode!==200)throw new Error('Backup object unavailable');
 return decryptBackup(Buffer.from(await new Response(result.stream).arrayBuffer()),key);
}
const manifest=JSON.parse((await read(manifestPath)).toString());
if(manifest.format!=='sevatrack-encrypted-backup-v2')throw new Error('Unsupported backup format');
async function checked(item){const bytes=await read(item.pathname);if(checksum(bytes)!==item.sha256||bytes.length!==item.size)throw new Error('Backup checksum mismatch');return bytes}
const directory=resolve(output);await mkdir(directory,{mode:0o700});await mkdir(join(directory,'photos'),{mode:0o700});
const database=await checked(manifest.database);await writeFile(join(directory,'database.json'),database,{flag:'wx',mode:0o600});
const photos=[];
for(const photo of manifest.photos){const bytes=await checked(photo),filename=checksum(Buffer.from(photo.path))+'.bin';await writeFile(join(directory,'photos',filename),bytes,{flag:'wx',mode:0o600});photos.push({path:photo.path,mime:photo.mime,filename,size:photo.size,sha256:photo.sha256})}
await writeFile(join(directory,'manifest.json'),JSON.stringify({format:'sevatrack-full-backup-v1',createdAt:manifest.createdAt,sourceStoreId:storeId(token),databaseSha256:checksum(database),photos}),{flag:'wx',mode:0o600});
await verifyBackup(directory);
console.log('Downloaded and verified database and photos. Use restore-backup.py to rehearse recovery into a NEW local SQLite file. Production has not changed.');
