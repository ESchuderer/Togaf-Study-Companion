// All inputs are local to this project.
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'public');
fs.mkdirSync(out,{recursive:true});
const banks=fs.readdirSync(path.join(root,'content/questions/en')).filter(f=>/^p[12]-set-\d{2}\.json$/.test(f)).sort().map(file=>{
  const src=path.basename(file,'.json');
  const exam=JSON.parse(fs.readFileSync(path.join(root,'content/questions/en',file),'utf8'));
  return {part:exam.part,title:exam.title,src,questions:exam.questions.map(q=>({...q,src}))};
});
fs.writeFileSync(path.join(out,'all-banks.js'),'window.TOGAF_BANKS='+JSON.stringify(banks)+';\n');
fs.copyFileSync(path.join(root,'THIRD-PARTY-NOTICES.txt'),path.join(out,'THIRD-PARTY-NOTICES.txt'));
console.log(`Prepared ${banks.length} sets, ${banks.reduce((n,b)=>n+b.questions.length,0)} questions.`);
// Keep bookmarked legacy filenames working, including session parameters and backup anchors.
for(const [file,target] of Object.entries({'practice.html':'./','drill.html':'practice/','weak-spots.html':'my-data/'})) {
  fs.writeFileSync(path.join(out,file),`<!doctype html><html lang="en"><meta charset="utf-8"><title>Page moved</title><script>const target=new URL(${JSON.stringify(target)},location.href);target.search=location.search;target.hash=location.hash;location.replace(target.href);</script><p><a href="${target}">Continue</a></p></html>`);
}
