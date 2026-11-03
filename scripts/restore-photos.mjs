// Restore only to a new, empty PRIVATE store. Never overwrite source photos.
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {list,put,get} from '@vercel/blob';
import {createHash} from 'node:crypto';
import {verifyBackup,storeId} from '../lib/backup-files.mjs';
const directory=process.argv[2],token=process.env.RESTORE_BLOB_READ_WRITE_TOKEN;
if(!directory||!storeId(token))throw new Error('Provide backup directory and RESTORE_BLOB_READ_WRITE_TOKEN for a new empty private store.');
const manifest=await verifyBackup(directory);
if(!manifest.sourceStoreId||storeId(token)===manifest.sourceStoreId)throw new Error('Restore target must be different from the source store.');
if((await list({token,limit:1})).blobs.length)throw new Error('Restore target is not empty. Use a new private store.');
for(const p of manifest.photos){
 await put(p.path,await readFile(join(directory,'photos',p.filename)),{token,access:'private',contentType:p.mime,addRandomSuffix:false,allowOverwrite:false});
 const result=await get(p.path,{token,access:'private',useCache:false});
 if(!result||result.statusCode!==200)throw new Error('Restored photo is unavailable');
 const bytes=Buffer.from(await new Response(result.stream).arrayBuffer());
 if(createHash('sha256').update(bytes).digest('hex')!==p.sha256)throw new Error('Restored photo checksum mismatch');
}
console.log(`Restored and verified ${manifest.photos.length} photos in the new private store. No source files changed.`);
