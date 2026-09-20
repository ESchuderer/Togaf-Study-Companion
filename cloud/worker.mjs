import {validate as validateDatasets, merge as mergeDatasets, LIMIT} from '../src/datasets.js';
import records from '../src/records.cjs';
export const validRun=records.validRun;
const validFeedback=records.validFeedback;
const SESSION = '__Host-togaf_session', STATE = '__Host-togaf_oauth';
const encoder = new TextEncoder();
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
export const hash = async value => base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))));
const cookie = (name,value,age) => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const cookies = request => Object.fromEntries((request.headers.get('Cookie') || '').split(';').map(s=>s.trim().split('=')));
const json = (data,status=200) => new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const redirect = (url,headers={}) => new Response(null,{status:302,headers:{Location:url,...headers}});
const allowed = (env,id) => (env.GITHUB_ALLOWED_IDS || '').split(',').map(s=>s.trim()).includes(id);
function fail(status,message) { throw Object.assign(new Error(message),{status}); }
function secure(response) {
  const r = new Response(response.body,response);
  r.headers.set('Cache-Control','private, no-store');
  r.headers.set('X-Content-Type-Options','nosniff');
  r.headers.set('Referrer-Policy','no-referrer');
  r.headers.set('X-Frame-Options','DENY');
  r.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  return r;
}
async function body(request, limit=1024*1024) {
  if(!(request.headers.get('Content-Type') || '').startsWith('application/json')) fail(415,'Expected JSON.');
  const reader=request.body?.getReader();
  if(!reader) fail(400,'Missing request body.');
  let size=0;const chunks=[];
  while(true) { const {done,value}=await reader.read();if(done)break;size+=value.length;
    if(size>limit){await reader.cancel();fail(413,'Request is too large.');}chunks.push(value); }
  const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{fail(400,'Invalid JSON.');}
}
async function data(env,user) {
  // ponytail: fetch the user's full history; paginate if personal histories reach thousands of runs.
  const [runs,feedback,stored,selection]=await Promise.all([
    env.DB.prepare('SELECT payload FROM runs WHERE user_id = ? ORDER BY rowid').bind(user.user_id).all(),
    env.DB.prepare('SELECT payload FROM feedback WHERE user_id = ? ORDER BY rowid').bind(user.user_id).all(),
    env.DB.prepare('SELECT bank_id,position,payload FROM dataset_chunks WHERE user_id = ? ORDER BY bank_id,position').bind(user.user_id).all(),
    env.DB.prepare('SELECT dataset_id AS id,enabled FROM dataset_selection WHERE user_id = ?').bind(user.user_id).all()
  ]);
  const grouped=new Map();
  for(const row of stored.results)grouped.set(row.bank_id,(grouped.get(row.bank_id)||'')+row.payload);
  const datasets=[...grouped.values()].map(raw=>JSON.parse(raw));
  return {selection:selection.results.map(s=>({...s,enabled:!!s.enabled})),datasets,user:{id:user.user_id,login:user.login},runs:runs.results.map(r=>JSON.parse(r.payload)),feedback:feedback.results.map(r=>JSON.parse(r.payload))};
}
export function createWorker(fetchExternal=fetch) {
  return {async fetch(request,env) {
    try {return secure(await route(request,env,fetchExternal));}
    catch(e) {return secure(json({error:e.status?e.message:'Server unavailable. Your local data has not been deleted.'},e.status||503));}
  }};
}
async function route(request,env,fetchExternal) {
  const url=new URL(request.url),now=Math.floor(Date.now()/1000);
  if(!env.SITE_ORIGIN || url.origin!==env.SITE_ORIGIN || !env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET ||
    !(env.GITHUB_ALLOWED_IDS || '').split(',').some(s=>/^\d+$/.test(s.trim()))) fail(503,'Deployment is not configured. Set the origin, GitHub OAuth settings and allowed numeric GitHub IDs.');
  if(!['GET','HEAD','POST'].includes(request.method)) fail(405,'Method not allowed.');
  if(request.method==='POST' && request.headers.get('Origin')!==env.SITE_ORIGIN) fail(403,'Same-origin requests required.');
  if(url.pathname==='/login' && request.method==='GET') {
    return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TOGAF Study Companion</title><body style="font:1.1rem system-ui;max-width:32rem;margin:4rem auto;padding:1rem"><h1>TOGAF Study Companion</h1><p>Sign in with an allowed GitHub account. Your progress and custom question sets sync to your account.</p><p><a href="/auth/login">Sign in with GitHub</a></p></body></html>',{headers:{'Content-Type':'text/html; charset=utf-8'}});
  }
  if(url.pathname==='/auth/login' && request.method==='GET') {
    const state=random(),verifier=random();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM oauth_states WHERE expires < ?').bind(now),
      env.DB.prepare('DELETE FROM sessions WHERE expires < ?').bind(now),
      env.DB.prepare('INSERT INTO oauth_states(state_hash,verifier,expires) VALUES(?,?,?)').bind(await hash(state),verifier,now+600)
    ]);
    const query=new URLSearchParams({client_id:env.GITHUB_CLIENT_ID,redirect_uri:env.SITE_ORIGIN+'/auth/callback',state,
      code_challenge:await hash(verifier),code_challenge_method:'S256',scope:'',allow_signup:'false'});
    return redirect('https://github.com/login/oauth/authorize?'+query,{'Set-Cookie':cookie(STATE,state,600)});
  }
  if(url.pathname==='/auth/callback' && request.method==='GET') {
    const state=url.searchParams.get('state'),code=url.searchParams.get('code');
    if(!state || state.length!==43 || state!==cookies(request)[STATE] || !code || code.length>512) fail(400,'Sign-in expired or was cancelled. Start again at /login.');
    const flow=await env.DB.prepare('DELETE FROM oauth_states WHERE state_hash = ? AND expires > ? RETURNING verifier').bind(await hash(state),now).first();
    if(!flow) fail(400,'Sign-in was already used or expired. Start again at /login.');
    const tokenResponse=await fetchExternal('https://github.com/login/oauth/access_token',{
      method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,code,
        redirect_uri:env.SITE_ORIGIN+'/auth/callback',code_verifier:flow.verifier}),signal:AbortSignal.timeout(15000)
    });
    if(!tokenResponse.ok) fail(502,'GitHub sign-in unavailable. Try again.');
    const token=await tokenResponse.json();
    if(typeof token.access_token!=='string') {
      // Only fixed messages may leave this boundary; never echo tokens, codes or upstream descriptions.
      const errors={
        incorrect_client_credentials:'GitHub rejected the app credentials (incorrect_client_credentials). The site owner must check the Client ID and stored Client Secret belong to the same OAuth app.',
        redirect_uri_mismatch:'GitHub rejected the callback URL (redirect_uri_mismatch). Check the OAuth app callback setting.',
        bad_verification_code:'GitHub rejected an expired, used or invalid authorization code (bad_verification_code). Start a fresh sign-in at /login; do not refresh the callback page.',
        unverified_user_email:'GitHub requires a verified email address (unverified_user_email). Verify your GitHub email, then start again at /login.'
      };
      fail(400,Object.hasOwn(errors,token.error)?errors[token.error]:'GitHub did not authorize sign-in. Start a fresh sign-in at /login.');
    }
    const profileResponse=await fetchExternal('https://api.github.com/user',{headers:{Authorization:'Bearer '+token.access_token,
      Accept:'application/vnd.github+json','User-Agent':'togaf-study','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(15000)});
    if(!profileResponse.ok) fail(502,'Cannot retrieve GitHub identity.');
    const profile=await profileResponse.json(),uid=String(profile.id);
    if(!/^\d+$/.test(uid) || typeof profile.login!=='string' || !allowed(env,uid)) fail(403,'This GitHub account is not on the study-site allowlist.');
    const session=random();
    await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,login,expires) VALUES(?,?,?,?)').bind(await hash(session),uid,profile.login,now+7*86400).run();
    const headers=new Headers({Location:'/'});
    headers.append('Set-Cookie',cookie(SESSION,session,7*86400));headers.append('Set-Cookie',cookie(STATE,'',0));
    return new Response(null,{status:302,headers});
  }
  const token=cookies(request)[SESSION];
  const user=token && /^[\w-]{43}$/.test(token) ? await env.DB.prepare('SELECT user_id,login FROM sessions WHERE token_hash = ? AND expires > ?').bind(await hash(token),now).first() : null;
  if(!user || !allowed(env,user.user_id)) {
    if(url.pathname.startsWith('/api/') || request.method==='POST') fail(401,'Sign in again. Unsynced results remain on this device.');
    return redirect('/login');
  }
  if(request.method==='POST' || url.pathname==='/api/data' || url.pathname==='/api/export') {
    // Bind the tab to its rendered account, so an account switch cannot upload another user's outbox.
    if(request.headers.get('X-Togaf-User')!==user.user_id) fail(409,'Account changed. Reload before syncing or signing out.');
  }
  if(url.pathname==='/auth/logout' && request.method==='POST') {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hash(token)).run();
    return new Response(null,{status:204,headers:{'Set-Cookie':cookie(SESSION,'',0)}});
  }
  if(url.pathname==='/api/bootstrap.js' && request.method==='GET') {
    const content=JSON.stringify(await data(env,user)).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
    return new Response('window.TOGAF_CLOUD = '+content+';',{headers:{'Content-Type':'text/javascript; charset=utf-8'}});
  }
  if(['/api/data','/api/export'].includes(url.pathname) && request.method==='GET') {
    const result=await data(env,user);
    return json(url.pathname==='/api/export'?{schema:1,exportedAt:new Date().toISOString(),...result}:result);
  }
  if(url.pathname==='/api/selection' && request.method==='POST') {
    const input=await body(request,20000);
    if(!Array.isArray(input)||input.length>100||input.some(s=>!s||typeof s.id!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(s.id)||typeof s.enabled!=='boolean')) fail(400,'Invalid dataset selection.');
    if(input.length)await env.DB.batch(input.map(s=>env.DB.prepare('INSERT INTO dataset_selection(user_id,dataset_id,enabled) VALUES(?,?,?) ON CONFLICT(user_id,dataset_id) DO UPDATE SET enabled=excluded.enabled').bind(user.user_id,s.id,Number(s.enabled))));
    return json({user:{id:user.user_id},saved:true});
  }
  if(url.pathname==='/api/datasets' && request.method==='POST') {
    let bank;
    try { const input=await body(request,LIMIT);bank=validateDatasets({version:1,banks:[input]})[0]; }
    catch(error){if(error.status)throw error;fail(400,'Invalid custom question set.');}
    const payload=JSON.stringify(bank),digest=await hash(payload);
    const existing=await env.DB.prepare('SELECT digest FROM dataset_banks WHERE user_id = ? AND bank_id = ?').bind(user.user_id,bank.id).first();
    if(existing?.digest===digest)return json({user:{id:user.user_id},saved:true});
    const current=await data(env,user);
    let merged;
    try {merged=mergeDatasets(current.datasets,[bank]);}catch{fail(existing?409:400,'Dataset conflict or limit exceeded. Use a new ID for changed content.');}
    if(encoder.encode(JSON.stringify({version:1,banks:merged})).length>LIMIT)fail(413,'Combined custom datasets exceed 10 MB.');
    // Update only the version read above. A concurrent revision cannot overwrite newer content.
    const statements=[existing
      ? env.DB.prepare('UPDATE dataset_banks SET digest=? WHERE user_id=? AND bank_id=? AND digest=?').bind(digest,user.user_id,bank.id,existing.digest)
      : env.DB.prepare('INSERT INTO dataset_banks(user_id,bank_id,digest) VALUES(?,?,?) ON CONFLICT(user_id,bank_id) DO NOTHING').bind(user.user_id,bank.id,digest)];
    const guard='EXISTS(SELECT 1 FROM dataset_banks WHERE user_id=? AND bank_id=? AND digest=?)';
    statements.push(env.DB.prepare('DELETE FROM dataset_chunks WHERE user_id=? AND bank_id=? AND '+guard).bind(user.user_id,bank.id,user.user_id,bank.id,digest));
    for(let at=0;at<payload.length;at+=100000)statements.push(env.DB.prepare('INSERT INTO dataset_chunks(user_id,bank_id,position,payload) SELECT ?,?,?,? WHERE '+guard).bind(user.user_id,bank.id,at/100000,payload.slice(at,at+100000),user.user_id,bank.id,digest));
    await env.DB.batch(statements);
    const saved=await env.DB.prepare('SELECT digest FROM dataset_banks WHERE user_id = ? AND bank_id = ?').bind(user.user_id,bank.id).first();
    if(saved.digest!==digest)fail(409,'Dataset changed during sync. Reload and retry.');
    return json({user:{id:user.user_id},saved:true});
  }
  if(url.pathname==='/api/sync' && request.method==='POST') {
    const input=await body(request);
    if(!input || !Array.isArray(input.runs) || !Array.isArray(input.feedback) || input.runs.length+input.feedback.length>20 ||
      !input.runs.every(validRun) || !input.feedback.every(validFeedback)) fail(400,'Invalid progress or feedback. Nothing was saved.');
    const statements=[];
    for(const [table,items] of [['runs',input.runs],['feedback',input.feedback]]) for(const item of items) {
      const payload=JSON.stringify(item);
      if(encoder.encode(payload).length>200000) fail(413,'One record is too large.');
      // Append-only content identity makes retries idempotent; never trust an incoming user_id.
      const id=await hash(payload);
      statements.push(env.DB.prepare(`INSERT INTO ${table}(user_id,record_id,payload) VALUES(?,?,?) ON CONFLICT(user_id,record_id) DO NOTHING`).bind(user.user_id,id,payload));
    }
    if(statements.length) await env.DB.batch(statements);
    return json({user:{id:user.user_id},saved:true});
  }
  if(url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) fail(404,'Not found.');
  if(!['GET','HEAD'].includes(request.method)) fail(405,'Method not allowed.');

  return env.ASSETS.fetch(request);
}
export default createWorker();
