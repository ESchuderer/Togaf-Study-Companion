// Full-length sessions count in either mode; short drills remain in topic statistics.
export const isFullLengthSession=r=>['study','exam'].includes(r.mode)&&r.max===40&&r.items.length===(r.part===1?40:r.part===2?8:0);
const percentage=runs=>runs.length?100*runs.reduce((n,r)=>n+r.score,0)/runs.reduce((n,r)=>n+r.max,0):null;
const combined=parts=>parts.every(p=>p.score!==null)?Math.min(...parts.map(p=>p.score)):null;
function assessment(score) {
  if(score===null)return 'Not enough data';
  if(score<60)return 'Below practice threshold';
  return score>=80?'Strong practice score':'Above practice threshold';
}
export function analyseProgress(runs,now=Date.now()) {
  const sessions=runs.filter(r=>isFullLengthSession(r)&&r.ts>=now-30*86400000&&r.ts<=now).slice().sort((a,b)=>a.ts-b.ts);
  const windows=[[],[]],history=[];
  for(const run of sessions) {
    const window=windows[run.part-1];window.push(run);if(window.length>5)window.shift();
    const scores=windows.map(runs=>({score:percentage(runs)}));
    history.push({ts:run.ts,part:run.part,mode:run.mode,questions:run.items.length,p1:scores[0].score,p2:scores[1].score,combined:combined(scores)});
  }
  const parts=windows.map((recent,index)=>{
    const score=percentage(recent);
    return {part:index+1,score,sessions:recent.length,label:assessment(score)};
  });
  const score=combined(parts);
  return {parts,combined:{score,label:assessment(score)},history:history.slice(-30)};
}
