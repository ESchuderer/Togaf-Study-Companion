import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {Readable} from 'node:stream';
import {openDatabase} from './sqlite.mjs';
import worker from './worker.mjs';

const root=path.resolve(import.meta.dirname,'..'),assets=path.join(root,'dist-cloud');
const {SITE_ORIGIN,GITHUB_CLIENT_ID,GITHUB_CLIENT_SECRET,GITHUB_ALLOWED_IDS}=process.env;
if(!SITE_ORIGIN||new URL(SITE_ORIGIN).origin!==SITE_ORIGIN||!SITE_ORIGIN.startsWith('https://')||!GITHUB_CLIENT_ID||!GITHUB_CLIENT_SECRET||!GITHUB_ALLOWED_IDS)throw Error('Set HTTPS SITE_ORIGIN and GitHub OAuth settings in private/host.env.');
if(!fs.existsSync(path.join(assets,'private-banks.js')))throw Error('Run npm run build:cloud before starting the host.');
fs.mkdirSync(path.join(root,'private'),{recursive:true});
const DB=openDatabase(path.join(root,'private/progress.sqlite'));
DB.sqlite.exec(fs.readFileSync(new URL('schema.sql',import.meta.url),'utf8'));
const env={SITE_ORIGIN,GITHUB_CLIENT_ID,GITHUB_CLIENT_SECRET,GITHUB_ALLOWED_IDS,DB,ASSETS:{
  async fetch(request){
    let pathname;
    try{pathname=decodeURIComponent(new URL(request.url).pathname);}catch{return new Response('Bad path',{status:400});}
    if(pathname.endsWith('/'))pathname+='index.html';
    let file=path.resolve(assets,'.'+pathname);
    if(!file.startsWith(assets+path.sep))return new Response('Not found',{status:404});
    try {
      file=fs.realpathSync(file);
      if(!file.startsWith(assets+path.sep)||!fs.statSync(file).isFile())return new Response('Not found',{status:404});
      const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.pdf':'application/pdf','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
      return new Response(request.method==='HEAD'?null:fs.readFileSync(file),{headers:{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}});
    }catch(error){if(error.code==='ENOENT'||error.code==='ENOTDIR')return new Response('Not found',{status:404});throw error;}
  }
}};
const server=http.createServer(async(req,res)=>{
  try {
    const headers=new Headers();for(let i=0;i<req.rawHeaders.length;i+=2)headers.append(req.rawHeaders[i],req.rawHeaders[i+1]);
    const request=new Request(new URL(req.url,SITE_ORIGIN),{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})});
    const response=await worker.fetch(request,env);
    res.statusCode=response.status;
    response.headers.forEach((v,k)=>{if(k!=='set-cookie')res.setHeader(k,v);});
    const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);
    if(response.body)Readable.fromWeb(response.body).pipe(res);else res.end();
  }catch{res.writeHead(503,{'Content-Type':'text/plain'});res.end('Host unavailable. Your saved data has not been deleted.');}
});
server.listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log('Local listener: http://127.0.0.1:'+server.address().port));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>{DB.sqlite.close();process.exit();}));
