import {verifyBackup} from '../lib/backup-files.mjs';
if(!process.argv[2])throw new Error('Usage: npm run backup:verify -- backups/dated-directory');
const result=await verifyBackup(process.argv[2]);
console.log(`Database and ${result.photos.length} photo checksums verified. Run restore-backup.py against a NEW local file to rehearse database restoration.`);
