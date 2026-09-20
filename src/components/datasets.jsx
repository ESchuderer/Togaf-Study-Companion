import React,{useState} from 'react';
import {Card,CardHeader,CardTitle,CardDescription,CardContent} from './ui/card';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Notice} from './shared';
import {banks,download,datasetGroups,disabledDatasets,setDatasetEnabled} from '../model';
import * as datasets from '../datasets';

export function Datasets({refresh}) {
  const [message,setMessage]=useState(''),[error,setError]=useState(false),[busy,setBusy]=useState(false);
  const report=(text,failed=false)=>{setMessage(text);setError(failed);};
  const groups=datasetGroups(),cloud=!!window.TogafCloud;
  return <Card className="mt-6" id="datasets"><CardHeader><CardTitle>Question sets</CardTitle><CardDescription>Enable or disable entire datasets for practice. Generated questions form one set. Import private practice questions you are permitted to use. {cloud?'Internal sets are provided by this private site. Your own imports sync to your account.':'Imports stay in this browser.'}</CardDescription></CardHeader><CardContent className="space-y-4">
    {message&&<Notice error={error}>{message}</Notice>}
    <div className="dataset-list">{groups.map(group=><div className="dataset-row" key={group.id}><span><strong>{group.title}</strong><small>{group.count} questions</small></span><Button variant="outline" role="switch" aria-checked={!disabledDatasets.has(group.id)} aria-label={`Enable ${group.title}`} data-dataset={group.id} onClick={()=>{try{setDatasetEnabled(group.id,disabledDatasets.has(group.id));refresh();report(cloud?'Dataset selection saved on this device. Check account sync status before switching devices. Existing results are kept.':'Dataset selection saved in this browser. Existing results are kept.');}catch(err){report(`Selection was not saved: ${err.message}`,true);}}}>{disabledDatasets.has(group.id)?'Disabled':'Enabled'}</Button></div>)}</div>
    <label htmlFor="dataset-file">Import question sets (JSON)</label>
    <Input id="dataset-file" aria-describedby="dataset-import-help" type="file" accept=".json,application/json" disabled={busy} onChange={async e=>{
      const input=e.currentTarget,file=input.files[0];if(!file)return;
      setBusy(true);
      try {if(file.size>datasets.LIMIT)throw Error('Dataset exceeds the 10 MB limit.');const count=datasets.importJSON(await file.text());refresh();report(`${count} question sets added or updated. Identical sets are ignored. ${cloud?'Saved on this device; check account sync status before using them on another device.':'Saved in this browser. Export sets to transfer them to another device.'}`);}
      catch(err){report(`Import failed: ${err.message} Existing data was kept.`,true);}
      finally {input.value='';setBusy(false);}
    }}/>
    <p className="muted" id="dataset-import-help">Text and embedded PNG, JPEG or WebP diagrams only. {cloud?'Personal imports are limited to 10 MB combined per account and also need room in browser storage for a local copy. Once synced, sign in with the same account on another device to access your sets and results automatically.':'Up to 10 MB of imported sets combined, subject to browser storage space. To transfer to another device, export your sets and results, then import the sets before restoring their results.'}</p>
    <div className="button-row"><Button variant="outline" id="dataset-template" onClick={()=>download(JSON.stringify({version:1,banks:[1,2].map(part=>({id:`my-part-${part}`,title:`My Part ${part} questions`,part,questions:banks.find(b=>b.part===part).questions.slice(0,1).map(({src,...q})=>q)}))},null,2),'question-set-template.json')}>Download template</Button>
    <Button variant="outline" id="dataset-export" onClick={()=>{try{const sets=datasets.merge(datasets.read(),window.TOGAF_PRIVATE_DATASETS||[],{replaceImages:true});const raw=sets.length?JSON.stringify({version:1,banks:sets}):null;if(!raw)throw Error('No custom sets to export.');download(raw,'custom-question-sets.json');report('Question-set export requested.');}catch(err){report(err.message,true);}}}>Export custom sets</Button></div>
    {cloud&&<p className="muted">Export custom sets includes your personal imports and the internal sets provided by this site. Keep this separate file if you want to restore sets manually.</p>}
  </CardContent></Card>;
}
