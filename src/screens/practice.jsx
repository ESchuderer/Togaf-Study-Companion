import {QuestionText} from '../components/question-text';
import React, {useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Check,Clock,Search,RotateCcw,Download} from 'lucide-react';
import {Button} from '../components/ui/button';
import {Card,CardHeader,CardTitle,CardDescription,CardContent,CardFooter} from '../components/ui/card';
import {Badge} from '../components/ui/badge';
import {Input} from '../components/ui/input';
import {Progress} from '../components/ui/progress';
import {PageHeading,LinkButton,Notice,Field} from '../components/shared';
import {stats,selectBanks,datasetGroups,datasetId,t,href,score,best,percent,time,prepare,practiceFilter,resultOf,download} from '../model';

function defaults() {
  const banks=selectBanks();
  const p=new URLSearchParams(location.search),part=p.get('part')==='2'?2:1;
  const all=banks.filter(b=>b.part===part).flatMap(b=>b.questions);
  const requested=p.get('topics')?.split('|');
  return {part,source:banks.some(b=>b.part===part&&(b.src===p.get('dataset')||datasetId(b)===p.get('dataset')))?p.get('dataset'):'',count:[0,2,8,10,20,40].includes(Number(p.get('count')))&&p.has('count')?Number(p.get('count')):part===1?20:8,
    mode:p.get('mode')==='exam'?'exam':'study',selection:['unseen','random','latest-mistakes','most-mistakes'].includes(p.get('selection'))?p.get('selection'):p.get('missed')==='1'?'latest-mistakes':'unseen',
    topics:new Set(all.map(q=>q.topic).filter(topic=>!requested||requested.includes(topic)))};
}

export function Practice({runs,refresh,setDirty,confirm}) {
  const banks=selectBanks();
  const [config,setConfig]=useState(()=>defaults()),[search,setSearch]=useState(''),[error,setError]=useState('');
  const [session,setSession]=useState(()=>{
    if(new URLSearchParams(location.search).get('auto')!=='1')return null;
    try{return prepare(defaults(),runs);}catch{return null;}
  });
  const [result,setResult]=useState(null),[saved,setSaved]=useState(false),[review,setReview]=useState(false),[now,setNow]=useState(Date.now());
  const graded=useRef(false), heading=useRef(null);
  useEffect(()=>{setDirty(!!session?.started&&!result || !!result&&!saved);return()=>setDirty(false);},[session?.started,result,saved]);
  useEffect(()=>{if(!session?.started||result)return;const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id);},[session?.started,result]);
  useEffect(()=>{if(session?.started)heading.current?.focus();},[session?.index,session?.started,result]);
  const questions=banks.filter(b=>b.part===config.part&&(!config.source||datasetId(b)===config.source||b.src===config.source)).flatMap(b=>b.questions);
  const topics=[...new Set(questions.map(q=>q.topic))].sort((a,b)=>t(a).localeCompare(t(b)));
  const topicStats=new Map(stats.topics(config.part,runs).map(q=>[q.topic,q]));
  const matches=questions.filter(practiceFilter(config,runs)).length;
  const update=patch=>setConfig(c=>({...c,...patch}));
  const prepareSession=()=>{try{setSession(prepare(config,runs));setError('');}catch(e){setError(e.message);}};
  const reset=()=>{setSession(null);setResult(null);setSaved(false);setReview(false);setError('');graded.current=false;};
  const finish=()=>{
    if(graded.current)return;
    graded.current=true;
    const run=resultOf(session);setResult(run);
    const ok=stats.save(run);setSaved(ok);setError(ok?'':stats.error);refresh();
  };
  const submit=()=>{
    const blank=session.questions.length-Object.keys(session.responses).length;
    if(blank)confirm('Finish this session?',t('{count} question(s) unanswered. Submit anyway?',{count:blank}),finish);
    else finish();
  };
  const retry=()=>{const ok=stats.save(result);setSaved(ok);setError(ok?'':stats.error);refresh();};
  const leaveResult=()=>!saved?confirm('Leave this session?','Unfinished answers and unsaved results will be lost. Saved progress is kept.',reset):reset();

  if(result) return <>
    <PageHeading eyebrow="Session complete" title="Turn your results into progress." action={<Button variant="outline" onClick={leaveResult}><RotateCcw/>{t('New mix')}</Button>}>{t('Review the reasoning, then revisit the topics that need work.')}</PageHeading>
    {error&&<Notice error>{error}<div className="button-row"><Button onClick={retry}>{t('Retry saving')}</Button><Button variant="outline" onClick={()=>download(JSON.stringify([result]),'togaf-unsaved-result.json')}><Download/>{t('Download this result')}</Button></div></Notice>}
    <Card id="result" className="result-card"><CardContent><div className="result-score"><strong>{percent(result.score,result.max)}<small>%</small></strong><div><Badge variant={result.pass?'default':'secondary'}>{t(result.pass?'Practice threshold reached':'Keep practicing')}</Badge><p id="score-line">{result.score} / {result.max} {t('points')}</p></div></div><div className="result-meta"><span><Clock size={16}/>{time(result.ms)}</span><span>{t('Part {part}',{part:result.part})}</span><span>{t(result.mode==='study'?'Study mode':'Exam mode')}</span><span role="status">{t(saved?(window.TogafCloud?'Saved on this device; check account sync status':'Saved on this browser'):'Not saved')}</span></div><p className="muted">{t('Practice threshold: 60%. Study-mode scores and repeated questions do not establish exam readiness.')}</p></CardContent><CardFooter className="gap-2 flex-wrap"><Button id="review-btn" onClick={()=>setReview(!review)}>{t(review?'Hide answer review':'Review all answers')}</Button><LinkButton to="my-data/" variant="outline">{t('My data & backups')}<ArrowRight/></LinkButton></CardFooter></Card>
    <Card className="mt-6"><CardHeader><CardTitle>{t('Learning targets')}</CardTitle><CardDescription>{t('Blank answers reduce the score but are excluded from topic evidence.')}</CardDescription></CardHeader><CardContent><TopicTable rows={stats.topics(result.part,[result])} part={result.part}/></CardContent></Card>
    {review&&<section className="answer-review"><h2>{t('Answer review')}</h2>{session.questions.map((q,i)=><Question key={q.n} q={q} part={session.part} choice={session.responses[q.n]} reveal index={i} total={session.questions.length}/>)}</section>}
  </>;

  if(session?.started) {
    const q=session.questions[session.index],answered=Object.keys(session.responses).length;
    return <><div className="session-heading"><div><p className="eyebrow">{t('Part {part}',{part:session.part})} / {t(session.mode==='study'?'Study mode':'Exam mode')}</p><h1>{t('Your practice session')}</h1></div><Button variant="outline" id="submit-btn" onClick={submit}>{t('Finish & score')}</Button></div>
      <div className="session-toolbar"><span>{t('Q{number}',{number:session.index+1})} / {session.questions.length}</span><Progress value={percent(answered,session.questions.length)} aria-label={t('Answered questions')}/><span>{answered} / {session.questions.length} {t('answered')}</span><span className="timer"><Clock size={15}/>{time(Math.max(0,now-session.started))}</span></div>
      <div ref={heading} tabIndex={-1} className="question-focus"><Question q={q} part={session.part} choice={session.responses[q.n]} reveal={session.mode==='study'&&!!session.responses[q.n]} index={session.index} total={session.questions.length} onSelect={key=>setSession(s=>s.mode==='study'&&s.responses[q.n]?s:{...s,responses:{...s.responses,[q.n]:key}})}/></div>
      <div className="session-navigation"><Button variant="outline" id="prev-btn" disabled={session.index===0} onClick={()=>setSession(s=>({...s,index:s.index-1}))}><ArrowLeft/>{t('Previous')}</Button><span>{t('Answers save when you finish the session.')}</span>{session.index===session.questions.length-1?<Button onClick={submit}>{t('Finish & score')}<Check/></Button>:<Button id="next-btn" onClick={()=>setSession(s=>({...s,index:s.index+1}))}>{t('Next')}<ArrowRight/></Button>}</div></>;
  }

  if(session) return <><PageHeading eyebrow="Ready when you are" title="One session. A little stronger.">{t('Check your mode, then begin. Unfinished answers are not saved.')}</PageHeading><Card className="ready-card"><CardHeader><Badge variant="secondary" className="w-fit">{t('Part {part}',{part:session.part})}</Badge><CardTitle className="text-3xl">{t('{count} questions',{count:session.questions.length})}</CardTitle></CardHeader><CardContent><Mode value={session.mode} onChange={mode=>setSession(s=>({...s,mode}))}/></CardContent><CardFooter className="gap-2"><Button id="start-btn" onClick={()=>{graded.current=false;const started=Date.now();setNow(started);setSession(s=>({...s,started}));}}>{t('Start session')}<ArrowRight/></Button><Button variant="outline" onClick={reset}>{t('Change topics')}</Button></CardFooter></Card></>;

  return <><PageHeading eyebrow="Build your practice" title="Practice with purpose.">{t('Choose a part, narrow your topics and work through a fresh mix.')}</PageHeading>{error&&<Notice error>{error}</Notice>}
    <div className="config-grid"><Card><CardHeader><CardTitle>{t('Session settings')}</CardTitle></CardHeader><CardContent className="space-y-6"><fieldset><legend>{t('Part')}</legend><div className="segmented">{[1,2].map(part=><label key={part} className={config.part===part?'chosen':''}><input type="radio" name="part" value={part} checked={config.part===part} onChange={()=>{setSearch('');update({part,source:'',count:part===1?20:8,topics:new Set(banks.filter(b=>b.part===part).flatMap(b=>b.questions.map(q=>q.topic)))});}}/>{t(part===1?'Part 1: Foundation':'Part 2: Practitioner')}</label>)}</div></fieldset><Field id="dataset" label="Question set"><select id="dataset" value={config.source} onChange={e=>update({source:e.target.value,topics:new Set(banks.filter(b=>b.part===config.part&&(!e.target.value||datasetId(b)===e.target.value||b.src===e.target.value)).flatMap(b=>b.questions.map(q=>q.topic)))})}><option value="">All enabled sets</option>{datasetGroups(banks.filter(b=>b.part===config.part)).map(b=><option key={b.id} value={b.id}>{b.title}</option>)}</select></Field><Field id="count" label="Session length"><select id="count" value={config.count} onChange={e=>update({count:Number(e.target.value)})}>{[2,8,10,20,40,0].map(n=><option key={n} value={n}>{t(n?'{count} questions':'All matching',{count:n})}</option>)}</select></Field><Mode value={config.mode} onChange={mode=>update({mode})}/><Field id="question-selection" label="Question selection"><select id="question-selection" value={config.selection} aria-describedby="question-selection-help" onChange={e=>update({selection:e.target.value})}><option value="unseen">Prefer unseen questions</option><option value="random">Random mix</option><option value="latest-mistakes">Latest mistakes</option><option value="most-mistakes">Most mistakes first</option></select><p id="question-selection-help" className="muted">{config.selection==='most-mistakes'?'Previously missed questions, ranked by total mistakes. Partial credit counts; unanswered questions do not.':config.selection==='latest-mistakes'?'Only questions below full credit on your latest answer.':config.selection==='unseen'?'Prefer questions you have not answered yet.':'A random mix of the selected questions.'}</p>{!matches&&['latest-mistakes','most-mistakes'].includes(config.selection)&&<p className="muted" role="status">No matching mistakes yet. Change question selection or choose more topics.</p>}</Field></CardContent><CardFooter className="config-submit"><p id="match-count" role="status">{t('{count} questions match',{count:matches})}</p><Button id="build-btn" disabled={!matches} onClick={prepareSession}>{t('Prepare session')}<ArrowRight/></Button></CardFooter></Card>
    <Card><CardHeader><CardTitle>{t('Choose topics')}</CardTitle><CardDescription>{t('Search by topic. Accuracy uses your latest answered questions.')}</CardDescription><label htmlFor="topic-search" className="sr-only">{t('Search topics')}</label><div className="search-field"><Search size={17}/><Input id="topic-search" placeholder={t('Search topics')} value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="button-row"><Button variant="outline" size="sm" id="t-all" onClick={()=>update({topics:new Set(topics)})}>{t('All')}</Button><Button variant="outline" size="sm" id="t-none" onClick={()=>update({topics:new Set()})}>{t('None')}</Button><Button variant="outline" size="sm" id="t-weak" onClick={()=>update({topics:new Set(topics.filter(topic=>topicStats.get(topic)?.pct<.7))})}>{t('Weakest only (below 70%)')}</Button></div></CardHeader><CardContent className="topic-list" id="topic-list">{topics.filter(topic=>t(topic).toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(topic=><label className="topic-row" key={topic}><input className="topic" type="checkbox" value={topic} checked={config.topics.has(topic)} onChange={e=>{const selected=new Set(config.topics);e.target.checked?selected.add(topic):selected.delete(topic);update({topics:selected});}}/><span>{t(topic)}<small>{questions.filter(q=>q.topic===topic).length} {t('questions')}</small></span>{topicStats.has(topic)&&<Badge variant="outline">{percent(topicStats.get(topic).earned,topicStats.get(topic).max)}%</Badge>}</label>)}{!topics.some(topic=>t(topic).toLocaleLowerCase().includes(search.toLocaleLowerCase()))&&<p>{t('No topics found.')}</p>}</CardContent></Card></div></>;
}

function Mode({value,onChange}) {
  return <fieldset className="mode-options"><legend>{t('Practice mode')}</legend>{['study','exam'].map(mode=><label key={mode} className={value===mode?'chosen':''}><input type="radio" name="mode" value={mode} checked={value===mode} onChange={()=>onChange(mode)}/><span><strong>{t(mode==='study'?'Study mode':'Exam mode')}</strong><small>{t(mode==='study'?'See the explanation after each answer.':'No feedback until you finish.')}</small></span></label>)}</fieldset>;
}

function Question({q,part,choice,reveal,onSelect,index,total}) {
  const shown=q,options=part===1?Object.fromEntries(shown.o):shown.o,bestKey=best(part,q);
  return <Card className="question-card" data-question-id={stats.qid(q)}><CardHeader><div className="question-meta"><Badge variant="secondary">{t(q.topic)}</Badge><span>{q.lo}</span><span>{index+1} / {total}</span></div>{part===2&&<div className="scenario"><h2>{shown.stitle}</h2><QuestionText text={shown.scenario}/></div>}<QuestionText className="question-text" text={shown.q} heading/>{shown.diagramDescription&&!shown.images?.length&&<QuestionText text={shown.diagramDescription}/>}{shown.images?.map((src,i)=><img key={i} src={src} alt={`Question diagram ${i+1}`} className="max-w-full h-auto rounded bg-white"/>)}</CardHeader><CardContent><div className="answer-options">{q.keys.map(key=><button key={key} type="button" data-key={key} aria-pressed={choice===key} disabled={!onSelect||reveal} className={'answer-option '+(choice===key?'selected ':'')+(reveal&&key===bestKey?'correct ':reveal&&choice===key?'incorrect ':'')} onClick={()=>onSelect?.(key)}><span className="option-letter">{key}</span><div className="answer-copy"><QuestionText text={options[key]}/>{reveal&&(key===bestKey||key===choice)&&<small className="option-status">{t(key===bestKey?'Best answer':'Your answer')}{part===2?` · ${q.pts[key]} / 5`:''}</small>}</div></button>)}</div>{reveal&&<div className="rationale"><h3>{t('Why this answer?')}</h3>{shown.note&&<QuestionText text={"Review note: "+shown.note}/>}<p>{t('Your score')}: {score(part,q,choice)} / {part===1?1:5}{!choice?' · '+t('Unanswered'):''}</p>{part===1?<QuestionText text={shown.e}/>:q.keys.map(key=><QuestionText key={key} text={key+". "+shown.rat[key]}/>)}</div>}</CardContent></Card>;
}

export function TopicTable({rows,part}) {
  if(!rows.length)return <p className="muted">{t('No answered questions yet.')}</p>;
  return <div className="table-scroll"><table><thead><tr><th>{t('Topic')}</th><th>{t('Points')}</th><th>{t('Accuracy')}</th><th>{t('Questions')}</th></tr></thead><tbody>{rows.map(q=><tr key={q.topic}><td><a href={href(`practice/?part=${part}&topics=${encodeURIComponent(q.topic)}`)}>{t(q.topic)}</a></td><td>{q.earned}/{q.max}</td><td><span className={q.pct<.7?'accuracy-low':'accuracy-good'}>{percent(q.earned,q.max)}%</span></td><td>{q.seen}</td></tr>)}</tbody></table></div>;
}
