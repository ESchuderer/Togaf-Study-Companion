import React,{useState} from 'react';
import {analyseProgress,isFullLengthSession} from '../statistics';
import {Card,CardHeader,CardTitle,CardDescription,CardContent} from '../components/ui/card';
import {PageHeading} from '../components/shared';
import {stats,percent} from '../model';

const display=value=>value===null?'No data':`${value.toFixed(1)}%`;

function ImprovementChart({points}) {
  const [selected,setSelected]=useState(null);
  const index=Math.min(selected??points.length-1,points.length-1),point=points[index];
  const series=[['p1','Part 1','var(--primary)',undefined],['p2','Part 2','var(--purple-text)','8 4'],['combined','Combined','var(--success-border)','3 4']];
  const x=i=>points.length===1?300:8+i/(points.length-1)*584;
  const delta=key=>{
    const values=points.map(p=>p[key]).filter(v=>v!==null);
    if(values.length<2)return 'Need more results';
    const change=values.at(-1)-values[0];
    return `${change>0?'+':''}${change.toFixed(1)} percentage points`;
  };
  return <Card className="improvement-card"><CardHeader><CardTitle>Overall improvement</CardTitle><CardDescription>Rolling average of full-length sessions. Study and exam mode, last 30 days.</CardDescription></CardHeader><CardContent>
    {!point?<p className="muted">Complete 40 Part 1 or 8 Part 2 questions to start your chart.</p>:<>
      <div className="trend-legend">{series.map(([key,label,color])=><span key={key}><i style={{background:color}}/>{label}: {delta(key)}</span>)}</div>
      <p className="muted">Change since the first plotted score. Dashed line: 60% practice threshold.</p>
      <div className="trend-layout"><div className="trend-axis" aria-hidden="true"><span>100%</span><span>60%</span><span>0%</span></div>
        <svg className="improvement-plot" viewBox="0 0 600 240" preserveAspectRatio="none" role="img" aria-label="Full-length practice improvement for Part 1, Part 2 and combined. Inspect a session below for exact scores.">
          {[0,60,100].map(value=><line key={value} x1="0" x2="600" y1={230-value*2.2} y2={230-value*2.2} stroke="var(--border)" strokeDasharray={value===60?'6 4':undefined} vectorEffect="non-scaling-stroke"/>)}
          {series.map(([key,label,color,dash])=><g key={key}><polyline fill="none" stroke={color} strokeWidth="3" strokeDasharray={dash} vectorEffect="non-scaling-stroke" points={points.flatMap((p,i)=>p[key]===null?[]:[`${x(i)},${230-p[key]*2.2}`]).join(' ')}/>{points.filter(p=>p[key]!==null).length===1&&points.map((p,i)=>p[key]!==null&&<circle key={i} cx={x(i)} cy={230-p[key]*2.2} r="4" fill={color}/>)}</g>)}
          <line x1={x(index)} x2={x(index)} y1="10" y2="230" stroke="var(--foreground)" strokeWidth="1" strokeDasharray="2 5" vectorEffect="non-scaling-stroke"/>
        </svg>
      </div>
      <label htmlFor="trend-session">Inspect session {index+1} of {points.length}: {new Date(point.ts).toLocaleString()} (Part {point.part}, {point.questions} questions, {point.mode} mode)</label>
      <input id="trend-session" type="range" min="0" max={Math.max(0,points.length-1)} value={index} disabled={points.length===1} onChange={e=>setSelected(Number(e.target.value))} aria-valuetext={`${new Date(point.ts).toLocaleString()}: Part 1 ${display(point.p1)}, Part 2 ${display(point.p2)}, combined ${display(point.combined)}`}/>
      <output className="trend-values" htmlFor="trend-session" aria-live="polite">{series.map(([key,label])=><span key={key}>{label}: <strong>{display(point[key])}</strong></span>)}</output>
    </>}
  </CardContent></Card>;
}

export function Statistics({runs}) {
  const progress=analyseProgress(runs);
  return <><PageHeading eyebrow="Auswertung" title="Statistics">Your results and progress across all datasets.</PageHeading>
    <section aria-labelledby="readiness-title"><h2 id="readiness-title">Overall practice readiness</h2><p className="muted">Latest five full-length sessions within 30 days: 40 questions for Part 1, 8 for Part 2. Study and exam mode both count.</p>
      <div className="readiness-grid">{[...progress.parts.map(p=>({...p,title:`Part ${p.part}`})),{...progress.combined,title:'Combined'}].map(p=><Card key={p.title} className="readiness-card"><CardHeader><CardTitle>{p.title}</CardTitle></CardHeader><CardContent><strong className="readiness-score" data-readiness={p.title}>{p.score===null?'Not yet available':display(p.score)}</strong><p className="readiness-label">{p.label}</p>{p.part?<p className="muted">{p.sessions} full-length sessions.</p>:<p className="muted">The lower of Part 1 and Part 2.</p>}</CardContent></Card>)}</div>
      <p className="muted">Practice scores, not a prediction of passing.</p>
    </section>
    <ImprovementChart points={progress.history}/>
    <div className="practice-grid">{[1,2].map(part=>{
      const exams=runs.filter(r=>r.part===part&&isFullLengthSession(r));
      const passed=exams.filter(r=>r.score>=Math.ceil(r.max*.6)).length;
      const topics=stats.topics(part,runs);
      return <Card key={part}><CardHeader><CardTitle>Part {part}: {part===1?'Foundation':'Practitioner'}</CardTitle><CardDescription>Full-length sessions in either mode. Practice threshold: 60%.</CardDescription></CardHeader><CardContent className="space-y-6">
        <section aria-label={`Part ${part} full-length outcomes`}><h3>Full-length success / failure</h3>{exams.length?<><div className="outcome-chart" role="img" aria-label={`${passed} passed, ${exams.length-passed} failed`}><span style={{width:`${percent(passed,exams.length)}%`}}/></div><p>{passed} passed ({percent(passed,exams.length)}%) / {exams.length-passed} failed ({percent(exams.length-passed,exams.length)}%). {exams.length} full-length sessions.</p></>:<p className="muted">No full-length sessions yet.</p>}</section>
        <section><h3>Topic confidence</h3><p className="muted">Latest-answer accuracy across all sessions, including short drills.</p>
        {topics.length?<div className="chart-list">{topics.map(q=><div key={q.topic}><div className="chart-label"><span>{q.topic}</span><strong>{percent(q.earned,q.max)}%</strong></div><meter min="0" max="100" value={percent(q.earned,q.max)} aria-label={`${q.topic} accuracy`}/><small>{q.seen} answered questions, {q.earned}/{q.max} points{q.seen<5?' (small sample)':''}</small></div>)}</div>:<p className="muted">No answered questions yet.</p>}</section>
        <section><h3>Recent full-length scores</h3>{exams.length?<ol className="chart-list">{[...exams].sort((a,b)=>a.ts-b.ts).slice(-10).map((r,i)=><li key={r.id||`${r.ts}-${i}`}><div className="chart-label"><span>{new Date(r.ts).toLocaleDateString()} ({r.items.length} questions, {r.mode})</span><strong>{percent(r.score,r.max)}%</strong></div><meter min="0" max="100" value={percent(r.score,r.max)} aria-label={`Full-length score ${i+1}`}/></li>)}</ol>:<p className="muted">Finish a full-length session to see your trend.</p>}</section>
      </CardContent></Card>;
    })}</div></>;
}
