import React,{useState} from 'react';
import {Card,CardHeader,CardTitle,CardDescription,CardContent} from './ui/card';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Notice} from './shared';
import {banks,download} from '../model';
import * as datasets from '../datasets';

export function Datasets({refresh}) {
  const [message,setMessage]=useState(''),[error,setError]=useState(false),[busy,setBusy]=useState(false);
  const report=(text,failed=false)=>{setMessage(text);setError(failed);};
  const custom=banks.filter(b=>b.src.startsWith('custom-'));
  return <Card className="mt-6" id="datasets"><CardHeader><CardTitle>Custom question sets</CardTitle><CardDescription>Import your own JSON sets. They stay in this browser. Choose a set in Practice, or mix it with the built-in questions.</CardDescription></CardHeader><CardContent className="space-y-4">
    {message&&<Notice error={error}>{message}</Notice>}
    <label htmlFor="dataset-file">Import question sets (JSON)</label>
    <Input id="dataset-file" type="file" accept=".json,application/json" disabled={busy} onChange={async e=>{
      const input=e.currentTarget,file=input.files[0];if(!file)return;
      setBusy(true);
      try {if(file.size>datasets.LIMIT)throw Error('Dataset exceeds the 10 MB limit.');const count=datasets.importJSON(await file.text());refresh();report(`${count} new question sets imported. Identical sets are ignored.`);}
      catch(err){report(`Import failed: ${err.message} Existing data was kept.`,true);}
      finally {input.value='';setBusy(false);}
    }}/>
    <p className="muted">Up to 10 MB, subject to browser storage space. Text and embedded PNG, JPEG or WebP diagrams only. For another device, import these sets before restoring their results.</p>
    <div className="button-row"><Button variant="outline" id="dataset-template" onClick={()=>download(JSON.stringify({version:1,banks:[1,2].map(part=>({id:`my-part-${part}`,title:`My Part ${part} questions`,part,questions:banks.find(b=>b.part===part).questions.slice(0,1).map(({src,...q})=>q)}))},null,2),'question-set-template.json')}>Download template</Button>
    <Button variant="outline" id="dataset-export" onClick={()=>{try{const raw=localStorage.getItem(datasets.KEY);if(!raw)throw Error('No custom sets to export.');download(raw,'custom-question-sets.json');report('Question-set export requested.');}catch(err){report(err.message,true);}}}>Export custom sets</Button></div>
    {custom.length>0&&<ul>{custom.map(b=><li key={b.src}>{b.title}: {b.questions.length} questions (Part {b.part})</li>)}</ul>}
  </CardContent></Card>;
}
