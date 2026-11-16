const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process'),{randomBytes}=require('node:crypto');
(async()=>{
 const {createClient}=await import('@libsql/client');
 const {encryptBackup,decryptBackup,snapshotDatabase}=await import('../lib/operational-backup.mjs');
 const key=randomBytes(32).toString('hex'),bytes=Buffer.from('private evidence bytes');
 const sealed=encryptBackup(bytes,key);assert.deepEqual(decryptBackup(sealed,key),bytes);assert(!sealed.includes(bytes));
 const damaged=Buffer.from(sealed);damaged[30]^=1;assert.throws(()=>decryptBackup(damaged,key));assert.throws(()=>decryptBackup(sealed,randomBytes(32).toString('hex')));assert.throws(()=>encryptBackup(bytes,''));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'seva-backup-test-'));
 const db=createClient({url:'file:'+path.join(dir,'source.db'),intMode:'bigint'});
 try{
 await db.execute('CREATE TABLE records(id INTEGER PRIMARY KEY, text TEXT, bytes BLOB)');
 await db.execute({sql:'INSERT INTO records VALUES(?,?,?)',args:[9007199254740993n,'Private test',new Uint8Array([1,2,3])]});
 const snapshot=await snapshotDatabase(db);assert.equal(snapshot.tables[0].rows[0][0].$integer,'9007199254740993');
 const recovered=decryptBackup(encryptBackup(Buffer.from(JSON.stringify(snapshot)),key),key);
 fs.writeFileSync(path.join(dir,'database.json'),recovered);
 const restore=spawnSync('python3',['scripts/restore-backup.py',path.join(dir,'database.json'),path.join(dir,'restored.db')],{encoding:'utf8'});assert.equal(restore.status,0,restore.stderr);
 const copy=createClient({url:'file:'+path.join(dir,'restored.db'),intMode:'bigint'});
 try{const r=(await copy.execute('SELECT * FROM records')).rows[0];assert.equal(r.id,9007199254740993n);assert.equal(r.text,'Private test');assert.deepEqual(Buffer.from(r.bytes),Buffer.from([1,2,3]))}finally{copy.close()}
 console.log('PASS encrypted backup, tamper detection, exact integer/blob recovery and isolated SQLite restore');
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
