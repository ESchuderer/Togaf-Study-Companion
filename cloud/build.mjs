import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {validate,LIMIT} from '../src/datasets.js';
const root=path.resolve(import.meta.dirname,'..');
const source=path.join(root,'private/private-datasets/all-private-questions.json');
if(!fs.existsSync(source))throw Error('Missing private/private-datasets/all-private-questions.json. Add your ignored internal datasets before deploying. For a site without internal sets, create {"version":1,"banks":[]} there.');
const raw=fs.readFileSync(source,'utf8');
if(Buffer.byteLength(raw)>LIMIT)throw Error('Internal datasets exceed the 10 MB limit.');
const data=JSON.parse(raw);
const banks=data.version===1&&Array.isArray(data.banks)&&!data.banks.length?[]:validate(data);
for(const script of ['scripts/prepare.mjs','node_modules/astro/bin/astro.mjs']) {
  execFileSync(process.execPath,[path.join(root,script),...(script.includes('astro')?['build']:[])],{cwd:root,env:{...process.env,TOGAF_DEPLOYMENT:'cloud',ASTRO_BASE:'/'},stdio:'inherit'});
}
const out=path.join(root,'dist-cloud');
fs.writeFileSync(path.join(out,'private-banks.js'),'window.TOGAF_PRIVATE_DATASETS='+JSON.stringify(banks)+';\n');
for(const file of ['index.html','practice/index.html','statistics/index.html','my-data/index.html']) {
  const html=fs.readFileSync(path.join(out,file),'utf8');
  if(!html.includes('/api/bootstrap.js')||!html.includes('/private-banks.js'))throw Error('Missing authenticated bootstrap: '+file);
}
for(const file of fs.readdirSync(out,{recursive:true})) {
  if(/private[\\/]|resources[\\/]|cloud[\\/]|\.sql$|wrangler/i.test(file))throw Error('Unexpected private asset: '+file);
}
console.log(`PASS: authenticated build contains ${banks.reduce((n,b)=>n+b.questions.length,0)} internal questions and their embedded images; other private files stay local.`);
