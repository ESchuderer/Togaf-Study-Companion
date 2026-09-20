import assert from 'node:assert/strict';
import {analyseProgress,isFullLengthSession} from '../src/statistics.js';
const now=Date.UTC(2026,8,20),day=86400000;
function run(part,score,n,extra={}) {
  const length=part===1?40:8,max=part===1?1:5;
  return {part,mode:'exam',ts:now-(10-n)*day,score,max:40,items:Array.from({length},(_,i)=>({id:`p${part}-${n}#${i}`,sel:'A',max})),...extra};
}
assert.equal(analyseProgress([],now).combined.score,null);
const short=run(1,1,1,{max:1,items:[{id:'one',sel:'A'}]});
for(const mode of ['study','exam']) {
  assert.equal(isFullLengthSession({...short,mode}),false);
  assert.equal(isFullLengthSession(run(1,40,1,{mode})),true);
  assert.equal(isFullLengthSession(run(2,40,1,{mode})),true);
  assert.equal(isFullLengthSession(run(2,35,1,{mode,max:35,items:run(2,35,1).items.slice(0,7)})),false);
}
assert.equal(isFullLengthSession(run(1,40,1,{max:39})),false);
assert.equal(isFullLengthSession(run(1,40,1,{mode:undefined})),false);
let result=analyseProgress([short,run(2,40,2,{mode:'study'}),run(2,40,0,{ts:now-31*day}),run(2,40,0,{ts:now+1})],now);
assert.equal(result.parts[0].score,null);assert.equal(result.parts[1].score,100);assert.equal(result.combined.score,null);assert.equal(result.history.length,1);
const sessions=[run(1,24,1),run(1,32,2,{mode:'study'}),run(1,40,3),run(2,20,4,{mode:'study'}),run(2,24,5),run(2,28,6)];
result=analyseProgress([...sessions].reverse(),now);
assert.equal(result.parts[0].score,80);assert.equal(result.parts[0].label,'Strong practice score');
assert.equal(result.parts[1].score,60);assert.equal(result.parts[1].label,'Above practice threshold');
assert.equal(result.combined.score,60,'weaker part determines combined score');
assert.equal(result.history[0].p1,60);assert.equal(result.history[0].combined,null);assert.equal(result.history.at(-1).combined,60);
assert.equal(result.history[1].mode,'study');
const blank=run(1,0,1,{items:run(1,0,1).items.map(i=>({...i,sel:null}))});
assert.equal(analyseProgress([blank],now).parts[0].score,0,'unanswered questions still reduce a submitted score');
const latest=[run(1,0,0),...[1,2,3,4,5].map(n=>run(1,40,n)),short];
assert.equal(analyseProgress(latest,now).parts[0].score,100,'latest five full sessions; drills never displace them');
assert.equal(analyseProgress([short,run(1,20,2)],now).parts[0].score,50,'short sessions do not affect scores');
console.log('PASS: full-length study/exam eligibility, partial credit, recency, latest-five averages, blank answers and weaker-part combined score.');
