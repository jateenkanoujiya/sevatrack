const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const {packagePhotos,verifyBackup}=await import('../lib/backup-files.mjs');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'seva-photo-backup-'));
 try{
  const snapshot={format:'sevatrack-backup-v1',tables:[{name:'evidence',columns:['id','key','mime'],rows:[['proof','evidence/student/proof','image/png']]}]};
  await fs.writeFile(path.join(dir,'database.json'),JSON.stringify(snapshot));
  const m=await packagePhotos(dir,async()=>Buffer.from('private-photo-test-bytes'),'test-store');
  assert.equal((await verifyBackup(dir)).photos.length,1);
  await fs.writeFile(path.join(dir,'photos',m.photos[0].filename),'tampered');
  await assert.rejects(verifyBackup(dir),/Photo checksum/);
  await fs.writeFile(path.join(dir,'photos',m.photos[0].filename),'private-photo-test-bytes');
  await fs.writeFile(path.join(dir,'database.json'),'tampered');
  await assert.rejects(verifyBackup(dir),/Database checksum/);
  await fs.writeFile(path.join(dir,'database.json'),JSON.stringify(snapshot));
  m.photos[0].filename='../outside';await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(m));
  await assert.rejects(verifyBackup(dir),/manifest does not match/);
  const incomplete=path.join(dir,'incomplete');await fs.mkdir(incomplete);await fs.writeFile(path.join(incomplete,'database.json'),JSON.stringify(snapshot));
  await assert.rejects(packagePhotos(incomplete,async()=>{throw new Error('Photo unavailable')},'test-store'));
  await assert.rejects(fs.stat(path.join(incomplete,'manifest.json')));
  console.log('Photo backup coverage, byte checksums, corruption/path rejection and incomplete-backup detection passed.');
 }finally{await fs.rm(dir,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
