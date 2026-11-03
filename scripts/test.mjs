import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const python=process.env.PYTHON||(process.platform==='win32'?'python':'python3');
let failed=false;
for(const file of readdirSync('tests').sort()){
 const command=file.endsWith('.cjs')?process.execPath:file.endsWith('.py')?python:null;
 if(!command)continue;
 console.log(`\nRunning ${file}`);
 const result=spawnSync(command,['tests/'+file],{stdio:'inherit'});
 if(result.status!==0){failed=true;if(result.error)console.error(result.error.message)}
}
process.exitCode=failed?1:0;
