import * as datasets from './datasets.js';

export function initializeCloud(stats,reloadDatasets) {
  const boot=window.TOGAF_CLOUD;
  if(!boot?.user?.id)return;
  const uid=boot.user.id,prefix='togaf.outbox.github.'+uid+'.';
  let busy=null,merging=false,again=false,startupError='';
  const uploaded=new Map((boot.datasets||[]).map(b=>[b.id,JSON.stringify(b)]));
  const change=()=>window.dispatchEvent(new Event('cloudchange'));
  const status=message=>{cloud.status=message;change();};
  const pending=()=>Object.keys(localStorage).filter(k=>k.startsWith(prefix)).map(key=>{const raw=localStorage.getItem(key);return {key,raw,...JSON.parse(raw)};});
  async function api(path,options={}) {
    const response=await fetch(path,{...options,cache:'no-store',signal:AbortSignal.timeout(20000),headers:{'X-Togaf-User':uid,...options.headers}});
    if(!response.ok){let message='Sync unavailable ('+response.status+').';try{message=(await response.json()).error||message;}catch{}throw Error(message);}
    if(response.status===204)return null;
    const data=await response.json();if(data.user?.id!==uid)throw Error('Account changed. Reload before syncing.');return data;
  }
  const post=(path,body)=>api(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  function mergeRemote(remote) {
    merging=true;
    try {
      if(remote.datasets?.length)datasets.importJSON(JSON.stringify({version:1,banks:remote.datasets}));
      remote.datasets?.forEach(b=>uploaded.set(b.id,JSON.stringify(b)));
      const selection=new Map((remote.selection||[]).map(s=>[s.id,s.enabled]));
      for(const entry of pending().filter(e=>e.kind==='selection'))selection.set(entry.item.id,entry.item.enabled);
      localStorage.setItem(datasets.SELECTION_KEY,JSON.stringify([...selection].filter(([,enabled])=>!enabled).map(([id])=>id)));
      reloadDatasets();
      stats.importRuns(remote.runs);
    } finally {merging=false;}
  }
  async function sync() {
    if(busy){again=true;return busy;}
    busy=(async()=>{
      if(startupError)throw Error(startupError);
      status('Syncing...');
      for(const bank of datasets.read())if(uploaded.get(bank.id)!==JSON.stringify(bank)){await post('/api/datasets',bank);uploaded.set(bank.id,JSON.stringify(bank));}
      while(true) {
        const batch=pending().slice(0,20);if(!batch.length)break;
        const choices=batch.filter(x=>x.kind==='selection').map(x=>x.item);
        if(choices.length)await post('/api/selection',choices);
        await post('/api/sync',{runs:batch.filter(x=>x.kind==='run').map(x=>x.item),feedback:batch.filter(x=>x.kind==='feedback').map(x=>x.item)});
        batch.forEach(x=>{if(localStorage.getItem(x.key)===x.raw)localStorage.removeItem(x.key);});
      }
      mergeRemote(await api('/api/data'));
      status('Synced to your account.');return true;
    })().catch(error=>{status(error.message+' Unsynced data stays on this device.');return false;}).finally(()=>{busy=null;if(again){again=false;queueMicrotask(()=>void sync());}});
    return busy;
  }
  const cloud=window.TogafCloud={
    user:boot.user,status:'Ready to sync.',sync,
    beforeSave(additions) {
      if(merging)return;
      if(startupError)throw Error(startupError);
      if(!additions.every(window.TogafRecords.validRun))throw Error('Invalid result data.');
      additions.forEach(item=>localStorage.setItem(prefix+crypto.randomUUID(),JSON.stringify({kind:'run',item})));
    },
    changed(){if(!merging)void sync();},
    selectionChanged(id,enabled) {
      localStorage.setItem(prefix+'selection.'+id,JSON.stringify({kind:'selection',item:{id,enabled}}));
      void sync();
    },
    async exportAccount() {if(!await sync())throw Error('Sync failed. Download device results and export custom sets to preserve unsynced data.');return api('/api/export');},
    async logout() {
      if(!await sync())return;
      try {await api('/auth/logout',{method:'POST'});location.replace('/login');}
      catch(error){status(error.message);}
    }
  };
  try {
    mergeRemote(boot);merging=true;
    stats.importRuns(pending().filter(x=>x.kind==='run').map(x=>x.item));
  } catch(error){startupError=error.message;status(startupError+' Export local backups before repairing data.');}
  finally {merging=false;}
  window.addEventListener('online',()=>void sync());
  window.addEventListener('focus',()=>void sync());
  window.addEventListener('storage',event=>{if(event.key?.startsWith(prefix)||event.key===datasets.KEY)void sync();});
  setTimeout(()=>void sync(),0);
}
