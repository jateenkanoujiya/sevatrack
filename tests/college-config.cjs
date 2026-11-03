const assert=require('node:assert/strict');
(async()=>{
 const {collegeConfigs}=await import('../lib/college-config.mjs');
 const a={id:'a',hosts:['a.example.test'],databaseUrlEnv:'DB_A',databaseTokenEnv:'TOKEN_A',blobTokenEnv:'BLOB_A'};
 const b={id:'b',hosts:['b.example.test'],databaseUrlEnv:'DB_B',databaseTokenEnv:'TOKEN_B',blobTokenEnv:'BLOB_B'};
 const env={DB_A:'libsql://a.turso.io',TOKEN_A:'a',BLOB_A:'vercel_blob_rw_storeA_1',DB_B:'libsql://b.turso.io',TOKEN_B:'b',BLOB_B:'vercel_blob_rw_storeB_2'};
 const config=(entries=[a,b],patch={})=>collegeConfigs({...env,SEVATRACK_COLLEGES:JSON.stringify(entries),...patch});
 assert.equal(config().length,2);assert.equal(collegeConfigs({}).length,0);
 assert.throws(()=>config([a,{...b,id:'a'}]));
 assert.throws(()=>config([a,{...b,hosts:a.hosts}]));
 assert.throws(()=>config([a,{...b,hosts:['*.example.test']}]));
 assert.throws(()=>config([a,b],{DB_B:'https://a.turso.io'}));
 assert.throws(()=>config([a,b],{BLOB_B:'vercel_blob_rw_storeA_rotated-token'}));
 assert.throws(()=>config([a,b],{TOKEN_B:''}));
 assert.throws(()=>config([a,{...b,databaseTokenEnv:'NEXT_PUBLIC_SECRET'}],{NEXT_PUBLIC_SECRET:'bad'}));
 assert.throws(()=>config([a,b],{DB_B:'file:/tmp/b.db',NODE_ENV:'production'}));
 assert.throws(()=>collegeConfigs({SEVATRACK_COLLEGES:'invalid-json'}));
 console.log('11 college configuration checks passed: unique domains, separate databases/stores, missing credentials and fail-closed validation.');
})().catch(e=>{console.error(e);process.exitCode=1});
