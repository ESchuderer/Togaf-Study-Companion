import {KEY as datasetKey} from './datasets';
import React, {useState, useEffect, useRef} from 'react';
import {BookOpen, LayoutDashboard, ChartNoAxesCombined, ArrowUpRight, ArrowRight, Target, CheckCheck, Layers, HardDrive, Sun, Moon} from 'lucide-react';
import {Button} from './components/ui/button';
import {Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter} from './components/ui/card';
import {Badge} from './components/ui/badge';
import {Progress} from './components/ui/progress';
import {AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel} from './components/ui/alert-dialog';
import {PageHeading, LinkButton, Metric, Notice, Check as Checkbox} from './components/shared';
import {stats, banks, t, href, percent, datasetError, reloadDatasets, selectBanks, selectRuns} from './model';
import {Practice} from './screens/practice';
import {ProgressPage} from './screens/progress';

const page = window.TOGAF_PAGE;
const links = [
  ['home','./','Overview',LayoutDashboard],['practice','practice/','Practice',BookOpen],
  ['my-data','my-data/','My data & backups',ChartNoAxesCombined]
];

function Home({runs,banks}) {
  const latest=[...stats.latest(1,runs),...stats.latest(2,runs)];
  const earned=latest.reduce((n,q)=>n+q.earned,0), max=latest.reduce((n,q)=>n+q.max,0);
  const weak=[1,2].flatMap(part=>stats.topics(part,runs).filter(q=>q.pct<.7).map(q=>({...q,part}))).sort((a,b)=>a.pct-b.pct).slice(0,3);
  return <>
    <PageHeading eyebrow="Your learning workspace" title="Make your next session count." action={<LinkButton variant="outline" to="TOGAF-CHEAT-SHEET-EN.pdf">{t('Cheat sheet (PDF)')}<ArrowUpRight/></LinkButton>}>{t('A little practice. A clear explanation. A stronger understanding.')}</PageHeading>
    <div className="metrics"><Metric label="Practice questions" value={banks.reduce((n,b)=>n+b.questions.length,0)} detail={t('Foundation and Practitioner')} icon={Layers}/><Metric label="Questions answered" value={latest.length} detail={t('Latest responses, across both parts')} icon={CheckCheck}/><Metric label="Current accuracy" value={max?`${percent(earned,max)}%`:'-'} detail={t('Latest earned points / possible points')} icon={Target}/><Metric label="Completed sessions" value={runs.length} detail={t('Saved on this browser')} icon={HardDrive}/></div>
    <div className="section-heading"><h2>{t('Choose your practice')}</h2></div>
    <div className="practice-grid">
    {[1,2].map(part=>{
      const count=banks.filter(b=>b.part===part).reduce((n,b)=>n+b.questions.length,0), seen=stats.latest(part,runs).length;
      return <Card className={'practice-card part-'+part} key={part}><CardHeader><div className="card-top"><span className="part-icon">0{part}</span><Badge variant="secondary">{t(part===1?'Foundation':'Practitioner')}</Badge></div><CardTitle className="text-2xl">{t(part===1?'Know the foundations.':'Think like an architect.')}</CardTitle><CardDescription>{t(part===1?'Recall and understanding. One point per correct answer.':'Apply your knowledge. Answers receive 5, 3, 1 or 0 points.')}</CardDescription></CardHeader><CardContent><div className="coverage-label"><span>{t('{count} questions explored',{count:seen})}</span><span>{seen} / {count}</span></div><Progress value={percent(seen,count)} aria-label={t('Part {part} coverage',{part})}/></CardContent><CardFooter className="flex-wrap gap-2"><LinkButton to={`practice/?part=${part}&count=${part===1?10:2}&auto=1`}>{t(part===1?'Quick practice: 10':'Quick practice: 2')}<ArrowRight/></LinkButton><LinkButton variant="outline" to={`practice/?part=${part}&count=${part===1?40:8}&mode=exam&auto=1`}>{t(part===1?'Exam mode: 40':'Exam mode: 8')}</LinkButton><a className="subtle-link" href={href(`practice/?part=${part}`)}>{t('Customize')}<ArrowUpRight size={14}/></a></CardFooter></Card>;
    })}</div>
    <div className="focus-section"><Card><CardHeader><CardTitle>{t('Your next focus')}</CardTitle><CardDescription>{t('Revisit a weak topic, then try fresh questions.')}</CardDescription></CardHeader><CardContent>{weak.length?<div className="focus-list">{weak.map(q=><a key={q.part+q.topic} href={href(`practice/?part=${q.part}&topics=${encodeURIComponent(q.topic)}`)}><span><small>{t('Part {part}',{part:q.part})}</small>{t(q.topic)}</span><Badge variant="outline">{percent(q.earned,q.max)}%</Badge><ArrowUpRight size={16}/></a>)}</div>:<div className="empty-state"><Target/><h3>{t(latest.length?'Keep exploring.':'Start with a fresh mix.')}</h3><p>{t(latest.length?'Try unseen topics and compare your reasoning with every rationale.':'Your topic recommendations will appear after you answer questions.')}</p></div>}</CardContent></Card>
    </div>
  </>;
}

function App() {
  const filterKey=datasetKey+'.custom-only';
  const [customOnly,setCustomOnly]=useState(()=>{try{return localStorage.getItem(filterKey)==='1';}catch{return false;}});
  const [filterError,setFilterError]=useState('');
  const toggleCustom=enabled=>{setCustomOnly(enabled);try{localStorage.setItem(filterKey,enabled?'1':'0');setFilterError('');}catch{setFilterError('This filter could not be saved. It applies until you leave this page.');}};
  const [theme,setTheme]=useState(()=>document.documentElement.dataset.theme);
  useEffect(()=>{const update=()=>setTheme(document.documentElement.dataset.theme);window.addEventListener('themechange',update);return()=>window.removeEventListener('themechange',update);},[]);
  const [record,setRecord]=useState(()=>{const runs=stats.load();return {runs,error:stats.error};});
  const [dirty,setDirty]=useState(false),[confirmation,setConfirmation]=useState(null);
  const leaving=useRef(false);
  const refresh=()=>{reloadDatasets();const runs=stats.load();setRecord({runs,error:stats.error});};
  useEffect(()=>{const listener=e=>{if(e.key===stats.KEY||e.key===datasetKey||e.key===null) refresh();};window.addEventListener('storage',listener);return()=>{window.removeEventListener('storage',listener);};},[]);
  useEffect(()=>{const listener=e=>{if(dirty&&!leaving.current){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',listener);return()=>window.removeEventListener('beforeunload',listener);},[dirty]);
  const confirm=(title,description,action)=>setConfirmation({title,description,action});
  const leave=action=>dirty?confirm('Leave this session?','Unfinished answers and unsaved results will be lost. Saved progress is kept.',()=>{leaving.current=true;action();}):action();
  return <div className="app-shell" onClickCapture={e=>{
    const a=e.target.closest('a');
    if(!dirty||!a||a.target==='_blank'||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button!==0)return;
    if(new URL(a.href).pathname===location.pathname&&new URL(a.href).search===location.search&&new URL(a.href).hash)return;
    e.preventDefault();leave(()=>location.assign(a.href));
  }}>
    <a className="skip-link" href="#main">{t('Skip to content')}</a>
    <aside className="sidebar no-print"><a className="brand" href={href('./')}><span className="brand-mark"><BookOpen size={20}/></span><span>TOGAF<small>{t('Practice workspace')}</small></span></a><p className="nav-label">{t('WORKSPACE')}</p><nav className="topnav" aria-label={t('Main navigation')}>{links.map(([key,to,label,Icon])=><a key={key} href={href(to)} aria-current={page===key?'page':undefined}><Icon size={18}/><span>{t(label)}</span></a>)}</nav></aside>
    <div className="workspace"><header className="workspace-header no-print"><span>{t(links.find(([key])=>key===page)[2])}</span><div className="header-actions">{page!=='my-data'&&<Checkbox id="custom-only" role="switch" checked={customOnly} disabled={dirty} onChange={e=>toggleCustom(e.target.checked)}>Custom sets only</Checkbox>}<Button id="theme-toggle" variant="outline" size="icon" onClick={()=>window.toggleTheme()} aria-label={t(theme==='dark'?'Switch to light mode':'Switch to dark mode')} title={t(theme==='dark'?'Switch to light mode':'Switch to dark mode')}>{theme==='dark'?<Sun/>:<Moon/>}</Button></div></header>
    <main id="main" tabIndex={-1}>{filterError&&<Notice error>{filterError}</Notice>}{page!=='my-data'&&customOnly&&!selectBanks(true).length&&<Notice>No custom question sets yet. <a href={href('my-data/#datasets')}>Import question sets</a> or turn off Custom sets only.</Notice>}{datasetError&&<Notice error>{datasetError}</Notice>}{record.error&&<Notice error>{record.error} <a href={href('my-data/#backup')}>{t('Manage backups')}</a></Notice>}
      {page==='home'&&<Home runs={selectRuns(record.runs,customOnly)} banks={selectBanks(customOnly)}/>}{page==='practice'&&<Practice key={String(customOnly)} customOnly={customOnly} runs={selectRuns(record.runs,customOnly)} refresh={refresh} setDirty={setDirty} confirm={confirm}/>}{page==='my-data'&&<ProgressPage runs={record.runs} refresh={refresh} confirm={confirm}/>}
    </main></div>
    <AlertDialog open={!!confirmation} onOpenChange={open=>{if(!open)setConfirmation(null);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{confirmation&&t(confirmation.title)}</AlertDialogTitle><AlertDialogDescription>{confirmation&&t(confirmation.description)}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('Cancel')}</AlertDialogCancel><AlertDialogAction onClick={()=>{const action=confirmation?.action;setConfirmation(null);action?.();}}>{t('Continue')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}

class AppBoundary extends React.Component {
  state={error:null};
  static getDerivedStateFromError(error){return {error};}
  render(){return this.state.error?<main className="fatal"><h1>{t('The app could not load.')}</h1><p>{t('Your saved data has not been changed. Reload to try again.')}</p><Button onClick={()=>location.reload()}>{t('Reload')}</Button></main>:this.props.children;}
}
export default function PracticeApp() {
  return <AppBoundary><App/></AppBoundary>;
}
