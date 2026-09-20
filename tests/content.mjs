import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const out = path.resolve(import.meta.dirname, '../dist');
const files = fs.readdirSync(out, {recursive:true}).filter(f => fs.statSync(path.join(out, f)).isFile()).map(f => f.replaceAll('\\', '/'));
const bundled=files.filter(f=>/^_astro\/[\w.-]+\.(?:js|css)$/.test(f));
assert.ok(bundled.some(f=>f.endsWith('.js')) && bundled.some(f=>f.endsWith('.css')),'Astro owns the bundled client assets');
assert.deepEqual(files.filter(f=>!bundled.includes(f)).sort(), ['.nojekyll','all-banks.js','drill.html','index.html','practice.html','records.js','weak-spots.html',
  'TOGAF-CHEAT-SHEET-EN.pdf','THIRD-PARTY-NOTICES.txt','exam-engine.js','practice/index.html','statistics/index.html','my-data/index.html'].sort());
for (const lang of ['EN']) assert.equal(fs.readFileSync(path.join(out,`TOGAF-CHEAT-SHEET-${lang}.pdf`)).subarray(0,5).toString(), '%PDF-');
for (const file of files.filter(f => /\.(js|html)$/.test(f))) assert.ok(!/github-signin|github-backup|api\.github\.com|TOGAF_AUTH_URL/.test(fs.readFileSync(path.join(out,file),'utf8')), file+' has no GitHub account integration');
let stored = null, fail = false;
const context = vm.createContext({window:{TOGAF_GENERATED:true}, localStorage:{
  getItem:() => stored,
  setItem:(key, value) => { if (fail) throw Error('Storage full'); stored = value; },
  removeItem:() => { stored = null; }
}});
for (const file of ['records.js','all-banks.js','exam-engine.js']) vm.runInContext(fs.readFileSync(path.join(out,file),'utf8'),context);
const {TOGAF_BANKS:banks,TogafStats:stats,TogafExam:exam} = context.window;
assert.equal(banks.length,22);
assert.equal(banks.reduce((n,b) => n+b.questions.length,0),528);
assert.ok(banks.every(b => /^p[12]-set-(0[1-9]|1[01])$/.test(b.src)));
for (const part of [1,2]) {
  const questions = exam.mix(banks,part,part===1?40:8);
  assert.equal(questions.length,part===1?40:8);
  assert.equal(new Set(questions.map(q => stats.qid(q))).size,questions.length);
  assert.ok(questions.every(q => q.src.startsWith('p'+part+'-')));
}
assert.equal(stats.KEY,'togaf.generated.runs.v1');
const run = {ts:1,part:1,title:'Generated check',score:1,max:1,items:[{id:'p1-set-01#1',topic:'EA Concepts',earned:1,max:1,sel:'B'}]};
assert.ok(stats.save(run));
assert.equal(stats.importRuns([run]),0);
assert.equal(stats.importJSON(JSON.stringify({runs:[run]})),0);
assert.equal(stats.load().length,1);
const before = stored;
assert.throws(() => stats.importRuns([{...run,score:0}]));
assert.throws(() => stats.importJSON('{broken'), /Invalid JSON backup/);
assert.throws(() => stats.importJSON('null'), /Invalid result data/);
assert.throws(() => stats.importRuns([{...run,items:[{...run.items[0],id:'example-set#1'}]}]));
assert.equal(stored,before,'invalid imports preserve data');
fail = true;
assert.equal(stats.save({...run,ts:2}),false);
assert.match(stats.error,/Storage full/);
assert.equal(stored,before);
fail = false;
stored = '{bad JSON';
assert.equal(stats.save(run),false);
assert.equal(stored,'{bad JSON','corrupt data is never overwritten');

for(const bank of banks) {
  assert.equal(bank.questions.length,bank.part===1?40:8,bank.src+' complete set');
  assert.equal(new Set(bank.questions.map(q=>q.n)).size,bank.questions.length,bank.src+' unique question numbers');
  for(const q of bank.questions) {
    const labels = bank.part===1 ? Array.from(q.o,o=>o[0]) : Object.keys(q.o);
    assert.deepEqual([...labels].sort(),['A','B','C','D'],bank.src+' option labels');
    if(bank.part===1) assert.ok(labels.includes(q.a),bank.src+' answer key');
    else assert.deepEqual(Object.values(q.pts).sort((a,b)=>a-b),[0,1,3,5],bank.src+' score ranking');
  }
}
console.log('PASS: Pages allowlist, 528 English questions, answer keys, isolated storage, atomic imports and storage failures.');
const source = fs.readFileSync(path.resolve(import.meta.dirname,'../src/model.js'),'utf8');
const helpers = vm.createContext({window:{TOGAF_BASE:'/generated/'},location:{href:'https://example.test/generated/practice/?lang=zz'},URL});
helpers.initializeCloud=()=>{};helpers.datasets={read:()=>[],asBanks:()=>[]};helpers.window.TOGAF_BANKS=[];
vm.runInContext(source.replace(/^import .*;$/gm,'').replaceAll('export ', '') + '\nwindow.check={t,href,datasetGroups};',helpers);
assert.equal(helpers.window.check.href('my-data/'),'https://example.test/generated/my-data/');
assert.equal(helpers.window.check.t('Part {part}',{part:2}),'Part 2');
assert.equal(helpers.window.check.t('__proto__'),'__proto__');

assert.equal(JSON.stringify(helpers.window.check.datasetGroups([
  {dataset:'personal-practice',datasetTitle:'Personal practice',title:'First bank',questions:[{}]},
  {dataset:'personal-practice',datasetTitle:'Personal practice',title:'Second bank',questions:[{},{}]}
])),JSON.stringify([{id:'personal-practice',title:'Personal practice',count:3}]));
