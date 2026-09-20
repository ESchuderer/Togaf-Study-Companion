// Native SQLite exercises real schema, query scoping and batch rollback without a Cloudflare account.
import assert from 'node:assert/strict';
import {openDatabase} from './sqlite.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
import {createWorker,hash} from './worker.mjs';
const DB=openDatabase(':memory:'),sqlite=DB.sqlite;sqlite.exec(fs.readFileSync(new URL('schema.sql',import.meta.url),'utf8'));
const origin='https://study.example',env={DB,SITE_ORIGIN:origin,GITHUB_CLIENT_ID:'test-client',GITHUB_CLIENT_SECRET:'test-secret',GITHUB_ALLOWED_IDS:'11,22',
  ASSETS:{fetch:async()=>new Response('private file',{headers:{'Content-Type':'text/plain'}})}};
let profile={id:11,login:'alice'},exchanges=0,oauthError=null;
const worker=createWorker(async(url,options)=>{
  if(url.endsWith('/access_token')){exchanges++;assert.equal(options.body.get('client_secret'),'test-secret');assert.equal(options.body.get('code_verifier').length,43);return Response.json(oauthError ? {error:oauthError,error_description:'private-upstream-detail'} : {access_token:'never-save-this'});}
  assert.equal(options.headers.Authorization,'Bearer never-save-this');return Response.json(profile);
});
const call=(path,{cookie='',user,method='GET',body,originHeader=origin}={})=>worker.fetch(new Request(origin+path,{method,headers:{Cookie:cookie,...(user?{'X-Togaf-User':user}:{}),...(method==='POST'?{Origin:originHeader,'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})}),env);
async function login(id,name){
  profile={id,login:name};
  const start=await call('/auth/login');assert.equal(start.status,302);
  const auth=new URL(start.headers.get('Location'));assert.equal(auth.searchParams.get('scope'),'');assert.equal(auth.searchParams.get('code_challenge_method'),'S256');
  const cookie=start.headers.get('Set-Cookie').split(';')[0],state=auth.searchParams.get('state');
  assert.equal((await call('/auth/callback?code=x&state='+state)).status,400,'state must be browser-bound');
  const result=await call('/auth/callback?code=x&state='+state,{cookie});
  assert.equal((await call('/auth/callback?code=x&state='+state,{cookie})).status,400,'single-use state');
  return result;
}
assert.equal((await call('/private-banks.js')).status,302,'banks require authentication');
assert.equal((await call('/TOGAF-CHEAT-SHEET-EN.pdf')).status,302,'downloads require authentication');
assert.equal((await call('/api/export')).status,401);
for(const code of ['incorrect_client_credentials','redirect_uri_mismatch','bad_verification_code','unknown-private-value']) {
  oauthError=code;
  const rejected=await login(11,'alice'),message=await rejected.text();
  assert.ok(rejected.status>=400);
  if(code!=='unknown-private-value')assert.ok(message.includes(code),'Safe diagnostic for '+code);
  assert.ok(!message.includes('private-upstream-detail')&&!message.includes('unknown-private-value'),'Do not echo arbitrary upstream data');
}
assert.equal(sqlite.prepare('SELECT count(*) AS n FROM sessions').get().n,0,'Failed token exchanges never create sessions');
oauthError=null;
const a=await login(11,'alice');assert.equal(a.status,302);
const alice=a.headers.getSetCookie().find(c=>c.startsWith('__Host-togaf_session=')).split(';')[0];
assert.ok(a.headers.getSetCookie().some(c=>c.includes('HttpOnly; Secure; SameSite=Lax')));
const b=await login(22,'bob');const bob=b.headers.getSetCookie().find(c=>c.startsWith('__Host-togaf_session=')).split(';')[0];
assert.equal((await login(33,'stranger')).status,403);
const run={title:'Practice',part:1,ts:Date.now(),score:0,max:1,items:[{id:'example-set#1',topic:'Phase A',earned:0,max:1,sel:'B'}]};
const note={id:'feedback-1',question:'example-set#1',part:1,kind:'possible-error',text:'Please review <script>alert(1)</script>',ts:Date.now()};
const payload={runs:[run],feedback:[note]};
assert.equal((await call('/api/sync',{method:'POST',cookie:alice,user:'11',body:payload,originHeader:'https://attacker.example'})).status,403);
assert.equal((await call('/api/sync',{method:'POST',cookie:bob,user:'11',body:payload})).status,409,'old Alice tab cannot write into Bob account');
assert.equal((await call('/api/sync',{method:'POST',cookie:alice,user:'11',body:{runs:[run,{bad:true}],feedback:[]}})).status,400);
assert.equal(sqlite.prepare('SELECT count(*) AS n FROM runs').get().n,0,'bad batch cannot partially commit');
for(let i=0;i<2;i++)assert.equal((await call('/api/sync',{method:'POST',cookie:alice,user:'11',body:payload})).status,200);
assert.equal(sqlite.prepare('SELECT count(*) AS n FROM runs').get().n,1,'retry idempotence');
assert.equal(sqlite.prepare('SELECT count(*) AS n FROM feedback').get().n,1);
const own=await(await call('/api/export',{cookie:alice,user:'11'})).json();assert.equal(own.runs.length,1);assert.equal(own.feedback.length,1);
const other=await(await call('/api/export?user_id=11',{cookie:bob,user:'22'})).json();assert.equal(other.runs.length,0);assert.equal(other.feedback.length,0);
assert.equal((await call('/api/export',{cookie:bob,user:'11'})).status,409);
assert.equal((await call('/private-banks.js')).status,302,'internal datasets require authentication');
assert.equal((await call('/api/selection',{method:'POST',cookie:alice,user:'11',body:[{id:'generated',enabled:false}]})).status,200);
assert.deepEqual((await(await call('/api/data',{cookie:alice,user:'11'})).json()).selection,[{id:'generated',enabled:false}]);
assert.deepEqual((await(await call('/api/data',{cookie:bob,user:'22'})).json()).selection,[]);
assert.equal((await call('/api/selection',{method:'POST',cookie:bob,user:'11',body:[]})).status,409);
assert.equal((await call('/api/selection',{method:'POST',cookie:alice,user:'11',body:[{id:'../bad',enabled:false}]})).status,400);
const bank={id:'personal',title:'Private',part:1,questions:[{n:1,topic:'Example',q:'Choose',o:[['A','one'],['B','two']],a:'A',e:'Explanation'}]};
for(let i=0;i<2;i++)assert.equal((await call('/api/datasets',{method:'POST',cookie:alice,user:'11',body:bank})).status,200);
assert.equal((await call('/api/datasets',{method:'POST',cookie:bob,user:'11',body:bank})).status,409);
assert.equal((await call('/api/datasets',{method:'POST',cookie:alice,user:'11',body:{...bank,title:'Changed'}})).status,409);
assert.equal((await(await call('/api/data',{cookie:alice,user:'11'})).json()).datasets.length,1);
assert.equal((await(await call('/api/data',{cookie:bob,user:'22'})).json()).datasets.length,0);
assert.equal((await call('/api/datasets',{method:'POST',cookie:alice,user:'11',body:{...bank,questions:[]}})).status,400);
const illustrated=structuredClone(bank);illustrated.questions[0].images=['data:image/png;base64,aA=='];
assert.equal((await call('/api/datasets',{method:'POST',cookie:alice,user:'11',body:illustrated})).status,200,'safe image enrichment syncs');
assert.equal((await call('/api/datasets',{method:'POST',cookie:alice,user:'11',body:{...illustrated,title:'Revision'}})).status,409);
assert.equal((await call('/',{cookie:alice})).status,200,'Astro overview is served at root');
const boot=await call('/api/bootstrap.js',{cookie:alice});assert.ok(!(await boot.text()).includes('<script>'));assert.equal(boot.headers.get('Cache-Control'),'private, no-store');
const asset=await call('/practice.html',{cookie:alice});assert.equal(asset.status,200);assert.equal(asset.headers.get('Cache-Control'),'private, no-store');
env.GITHUB_ALLOWED_IDS='22';assert.equal((await call('/api/data',{cookie:alice,user:'11'})).status,401,'allowlist removal revokes existing session');env.GITHUB_ALLOWED_IDS='11,22';
assert.equal((await call('/auth/logout',{cookie:alice,user:'11',method:'POST'})).status,204);
assert.equal((await call('/api/data',{cookie:alice,user:'11'})).status,401);
sqlite.prepare('UPDATE sessions SET expires=0').run();assert.equal((await call('/practice.html',{cookie:bob})).status,302,'expired sessions denied');
assert.equal(sqlite.prepare('SELECT count(*) AS n FROM sessions WHERE token_hash = ?').get(await hash('never-save-this')).n,0);
console.log('PASS: OAuth state/PKCE/allowlist, private assets, account isolation, account-switch guard, CSRF, atomic validation, idempotent retries, exports, expiry and logout.');
sqlite.close();
