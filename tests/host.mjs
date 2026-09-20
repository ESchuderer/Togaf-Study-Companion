import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {openDatabase} from '../cloud/sqlite.mjs';
import {hash} from '../cloud/worker.mjs';
const root=path.resolve(import.meta.dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'togaf-host-'));
// Isolate the actual host and its data, so this check cannot touch an owner's database.
for(const dir of ['cloud','src'])fs.cpSync(path.join(root,dir),path.join(tmp,dir),{recursive:true});
fs.writeFileSync(path.join(tmp,'package.json'),' {"type":"module"}');
fs.mkdirSync(path.join(tmp,'dist-cloud'));fs.mkdirSync(path.join(tmp,'private'));
fs.writeFileSync(path.join(tmp,'dist-cloud/index.html'),'host fixture');
fs.writeFileSync(path.join(tmp,'dist-cloud/private-banks.js'),'private fixture');
const DB=openDatabase(path.join(tmp,'private/progress.sqlite'));
DB.sqlite.exec(fs.readFileSync(path.join(tmp,'cloud/schema.sql'),'utf8'));
const token='a'.repeat(43),expiry=Math.floor(Date.now()/1000)+600;
DB.prepare('INSERT INTO sessions(token_hash,user_id,login,expires) VALUES(?,?,?,?)').bind(await hash(token),'11','alice',expiry).run();DB.sqlite.close();
const child=spawn(process.execPath,[path.join(tmp,'cloud/host.mjs')],{env:{...process.env,SITE_ORIGIN:'https://study.example',GITHUB_CLIENT_ID:'test',GITHUB_CLIENT_SECRET:'test',GITHUB_ALLOWED_IDS:'11',PORT:'0'},windowsHide:true,stdio:['ignore','pipe','pipe']});
let errors='';child.stderr.on('data',d=>errors+=d);
try {
  const port=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Host startup timeout: '+errors)),10000);
    child.once('error',e=>{clearTimeout(timer);reject(e);});
    child.stdout.on('data',d=>{const match=String(d).match(/127.0.0.1:(\d+)/);if(match){clearTimeout(timer);resolve(match[1]);}});
    child.once('exit',()=>{clearTimeout(timer);reject(Error(errors));});
  });
  const base='http://127.0.0.1:'+port,headers={Cookie:'__Host-togaf_session='+token,'X-Togaf-User':'11'};
  assert.equal((await fetch(base+'/private-banks.js',{redirect:'manual'})).status,302);
  const bank=await fetch(base+'/private-banks.js',{headers});assert.equal(await bank.text(),'private fixture');assert.equal(bank.headers.get('cache-control'),'private, no-store');
  assert.equal((await fetch(base+'/%2e%2e%2fprivate/progress.sqlite',{headers})).status,404);
  const run={id:'host-test',title:'Test',part:1,ts:1,score:1,max:1,items:[{id:'test#1',topic:'Test',sel:'A',earned:1,max:1}]};
  const response=await fetch(base+'/api/sync',{method:'POST',headers:{...headers,Origin:'https://study.example','Content-Type':'application/json'},body:JSON.stringify({runs:[run],feedback:[]})});assert.equal(response.status,200);
  assert.equal((await(await fetch(base+'/api/data',{headers})).json()).runs.length,1);
  console.log('PASS: native self-host serves only authenticated assets, blocks traversal, and persists account progress through the shared backend.');
} finally {
  child.kill();await new Promise(r=>child.once('exit',r));
  const target=fs.realpathSync(tmp);assert.equal(path.dirname(target),fs.realpathSync(os.tmpdir()));assert.ok(path.basename(target).startsWith('togaf-host-'));fs.rmSync(target,{recursive:true,force:true});
}
