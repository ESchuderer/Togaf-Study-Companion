import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

assert.ok(process.env.npm_execpath,'Run this check with npm run test:standalone.');
const source=path.resolve(import.meta.dirname,'..');
const isolated=fs.mkdtempSync(path.join(os.tmpdir(),'togaf-standalone-'));
const excluded=new Set(['node_modules','dist','.astro','previews','.git','.wrangler']);
fs.cpSync(source,isolated,{recursive:true,filter:file=>{
  if(path.relative(source,file).split(path.sep).some(part=>excluded.has(part)||/^\.(?:env|dev\.vars)/.test(part)))return false;
  assert.ok(!fs.lstatSync(file).isSymbolicLink(),'Standalone sources must not borrow files through symlinks: '+file);
  return true;
}});
console.log('Checking an isolated copy with fresh dependencies and GitHub Pages subpath routing.');
try {
  for(const args of [['ci'],['test'],['run','test:browser']]) {
    execFileSync(process.execPath,[process.env.npm_execpath,...args],{
      cwd:isolated,env:{...process.env,ASTRO_BASE:'/generated/',NODE_PATH:''},stdio:'pipe',windowsHide:true
    });
  }
  console.log('PASS: isolated npm ci, Astro build, content/storage checks and browser tests at /generated/. No parent project files or node_modules used.');
  // Verify the final resolved target before deleting this check's temporary directory.
  const target=fs.realpathSync(isolated);
  assert.equal(path.dirname(target),fs.realpathSync(os.tmpdir()));
  assert.ok(path.basename(target).startsWith('togaf-standalone-'));
  fs.rmSync(target,{recursive:true,force:true});
} catch(error) {
  console.error(error.stdout?.toString()||'',error.stderr?.toString()||'');
  console.error('Failed copy retained for diagnosis:',isolated);
  process.exitCode=1;
}
