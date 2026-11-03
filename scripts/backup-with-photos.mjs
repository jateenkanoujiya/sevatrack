// Run with credentials for ONE college. Never prints tokens or account records.
import {mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {get} from '@vercel/blob';
import {packagePhotos,verifyBackup,storeId} from '../lib/backup-files.mjs';
const output=process.argv[2],token=process.env.BLOB_READ_WRITE_TOKEN;
if(!output||!storeId(token))throw new Error('Provide a new backup directory and private BLOB_READ_WRITE_TOKEN.');
const directory=resolve(output);
await mkdir(directory,{mode:0o700}); // Refuse to merge with an existing backup.
const child=spawnSync(process.execPath,[fileURLToPath(new URL('./backup-database.mjs',import.meta.url)),join(directory,'database.json')],{stdio:'pipe',encoding:'utf8'});
if(child.status!==0)throw new Error('Database snapshot failed. Backup is incomplete.');
await packagePhotos(directory,async pathname=>{
 const result=await get(pathname,{access:'private',token,useCache:false});
 if(!result||result.statusCode!==200)throw new Error('A referenced private photo is unavailable. Backup is incomplete.');
 return new Uint8Array(await new Response(result.stream).arrayBuffer());
},storeId(token));
const manifest=await verifyBackup(directory);
console.log(`Complete database and ${manifest.photos.length} private photos saved and checksummed. Protect this directory; it contains personal data.`);
console.log('Unfinished uploads are not evidence and are not copied. A photo removed during backup causes failure; retry with a new directory.');
