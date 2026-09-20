import React,{useEffect,useState} from 'react';
import {Button} from './ui/button';
import {download} from '../model';

export function Account() {
  const cloud=window.TogafCloud;
  const [status,setStatus]=useState(cloud?.status||'');
  useEffect(()=>{const update=()=>setStatus(cloud.status);window.addEventListener('cloudchange',update);return()=>window.removeEventListener('cloudchange',update);},[cloud]);
  if(!cloud)return null;
  return <aside className="account-strip no-print" aria-label="Your account">
    <strong>{cloud.user.login}</strong><span role="status">{status}</span>
    <div className="button-row"><Button id="cloud-sync" size="sm" variant="outline" onClick={()=>cloud.sync()}>Sync</Button>
    <Button id="cloud-export" size="sm" variant="outline" onClick={async()=>{try{download(JSON.stringify(await cloud.exportAccount()),'study-companion-account.json');}catch(error){setStatus(error.message);}}}>Export account</Button>
    <Button id="cloud-logout" size="sm" variant="outline" onClick={()=>cloud.logout()}>Sign out</Button></div>
  </aside>;
}
