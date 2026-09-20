// Standalone Edge smoke test. Build with ASTRO_BASE=/generated/ before testing that base.
const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const hosted=process.argv.includes('--cloud');
const root=path.resolve(__dirname,'..'),webroot=path.join(root,hosted?'dist-cloud':'dist');
const state={uid:'11',fail:false,accounts:{'11':{datasets:[],runs:[],feedback:[],selection:[]},'22':{datasets:[],runs:[],feedback:[],selection:[]}}};
const base=(process.env.ASTRO_BASE||'/').replace(/\/$/,'');
const profile=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'togaf-pages-check-'));
const server=http.createServer(async(req,res)=>{

  let pathname=new URL(req.url,'http://localhost').pathname;
  if(base){if(!pathname.startsWith(base+'/')){res.writeHead(404).end();return;}pathname=pathname.slice(base.length);}
  if(hosted&&pathname==='/private-banks.js') {
    const banks=require('../src/datasets.js').validate({version:1,banks:[{id:'internal-example',dataset:'internal-practice',datasetTitle:'Internal practice',part:1,title:'Example bank',questions:[{n:1,topic:'Example',q:'Choose the first option.',o:[['A','First'],['B','Second']],a:'A',e:'First is correct.',images:['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=']}]}]});
    res.writeHead(200,{'Content-Type':'text/javascript'});res.end('window.TOGAF_PRIVATE_DATASETS='+JSON.stringify(banks)+';');return;
  }
  if(hosted&&pathname.startsWith('/api/')) {
    const account=state.accounts[state.uid];
    const data=()=>({user:{id:state.uid,login:'user'+state.uid},...account});
    const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
    if(pathname==='/api/bootstrap.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end('window.TOGAF_CLOUD='+JSON.stringify(data())+';');return;}
    if(req.headers['x-togaf-user']!==state.uid){send(409,{error:'Account changed. Reload before syncing.'});return;}
    if(state.fail){send(503,{error:'Offline simulation'});return;}
    if(req.method==='GET'){send(200,data());return;}
    let raw='';for await(const chunk of req)raw+=chunk;
    const input=JSON.parse(raw||'null');
    if(pathname==='/api/datasets'){const i=account.datasets.findIndex(b=>b.id===input.id);if(i<0)account.datasets.push(input);else account.datasets[i]=input;}
    if(pathname==='/api/selection')for(const s of input){account.selection=account.selection.filter(v=>v.id!==s.id);account.selection.push(s);}
    if(pathname==='/api/sync')for(const r of input.runs)if(!account.runs.some(old=>JSON.stringify(old)===JSON.stringify(r)))account.runs.push(r);
    send(200,{user:{id:state.uid},saved:true});return;
  }
  if(pathname.endsWith('/'))pathname+='index.html';
  let file;
  try{file=path.resolve(webroot,'.'+decodeURIComponent(pathname));}catch{res.writeHead(400).end();return;}
  if(!file.startsWith(webroot+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(file,(err,data)=>{
    if(err){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.pdf':'application/pdf'})[path.extname(file)]||'text/plain');res.end(data);
  });
});
let edge,ws;
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port+base;
  edge=spawn(process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',[
    '--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'
  ],{windowsHide:true,stdio:'ignore'});
  edge.on('error',error=>{console.error(error.message);process.exitCode=1;server.close();});
  const endpoint=path.join(profile,'DevToolsActivePort');
  for(let i=0;i<100&&!fs.existsSync(endpoint);i++)await new Promise(r=>setTimeout(r,100));
  assert.ok(fs.existsSync(endpoint),'Edge debugging endpoint; set EDGE_PATH to your browser executable');
  const port=fs.readFileSync(endpoint,'utf8').split('\n')[0];
  const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  ws=new WebSocket(tabs.find(p=>p.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  let id=0;const pending=new Map(),errors=[];
  ws.onmessage=event=>{
    const m=JSON.parse(event.data);
    if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}
    else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);
  };
  const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
  const evaluate=async expression=>{
    const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;
  };
  await call('Runtime.enable');
  const go=async file=>{
    await call('Page.navigate',{url:origin+'/'+file});
    for(let i=0;i<100;i++){
      await new Promise(r=>setTimeout(r,50));
      if(await evaluate('location.href === '+JSON.stringify(origin+'/'+file)+' && document.readyState === "complete"'))return;
    }
    throw Error('Page load timeout: '+file);
  };
  await require(hosted?'./cloud-browser.cjs':'./browser.cjs')({call,evaluate,go,origin,errors,root,state});
  await call('Browser.close');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{if(ws)ws.close();if(edge)edge.kill();server.close();});
