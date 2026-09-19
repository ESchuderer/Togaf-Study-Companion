import * as datasets from './datasets.js';
// The standalone engine owns mixing, grading and backward-compatible backup validation.
export const stats = window.TogafStats;
export const banks = window.TOGAF_BANKS;
const bundled = banks.slice();
export let datasetError = '';
export function reloadDatasets() {
  try { banks.splice(0,banks.length,...bundled,...datasets.asBanks(datasets.read())); datasetError=''; }
  catch (error) { datasetError='Custom datasets unavailable: '+error.message; }
}
reloadDatasets();
export const t = (text, values = {}) => text.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(values, key) ? values[key] : match);
export const href = path => new URL(path, new URL(window.TOGAF_BASE || './', location.href)).href;
export const score = (part, q, choice) => window.TogafExam.scoreOf.call({part}, q, choice);
export const best = (part, q) => window.TogafExam.bestKey.call({part}, q);
export const percent = (earned, max) => max ? Math.round(earned / max * 100) : 0;
export const time = ms => `${Math.floor(ms / 60000).toString().padStart(2,'0')}:${Math.floor(ms / 1000 % 60).toString().padStart(2,'0')}`;

export const shuffle = values => window.TogafExam.shuffle(values);

export const selectBanks = customOnly => customOnly ? banks.filter(b=>b.src.startsWith('custom-')) : banks;
export function selectRuns(runs, customOnly) {
  if(!customOnly)return runs;
  const ids=new Set(selectBanks(true).flatMap(b=>b.questions.map(q=>stats.qid(q,b.src))));
  return runs.map(r=>({...r,items:r.items.filter(i=>ids.has(i.id))})).filter(r=>r.items.length);
}

export function prepare({part, count, topics, onlyMissed, unseen, mode, source, customOnly=false}, runs) {
  const latest = stats.latest(part, runs);
  const seen = new Set(latest.map(q => q.id));
  const missed = new Set(latest.filter(q => q.earned < q.max).map(q => q.id));
  const questions = window.TogafExam.mix(selectBanks(customOnly).filter(b=>!source||b.src===source), part, count,
    q => topics.has(q.topic) && (!onlyMissed || missed.has(stats.qid(q))),
    q => !unseen || !seen.has(stats.qid(q)));
  if (questions.length>1000) throw Error('Choose at most 1000 questions per session.');
  if (!questions.length) throw Error(t("No questions match. Widen the topics or untick 'only missed'."));
  return {part, mode, questions:questions.map(q => ({...q, keys:shuffle(part===1?q.o.map(o=>o[0]):Object.keys(q.o))})), responses:{}, index:0, started:0};
}

export function resultOf(session, now = Date.now()) {
  const {part, questions, responses, mode, started} = session;
  const items = questions.map(q => ({id:stats.qid(q),lo:q.lo,topic:q.topic,earned:score(part,q,responses[q.n]),max:part===1?1:5,sel:responses[q.n] || null}));
  const earned = items.reduce((n,i) => n+i.earned,0), max = items.reduce((n,i) => n+i.max,0);
  return {id:crypto.randomUUID(),title:`Mixed practice - Part ${part} - ${questions.length} questions`,part,kind:'drill',ts:now,mode,
    score:earned,max,pass:earned>=Math.ceil(max*.6),ms:Math.max(0,now-started),items};
}

export function download(text, name) {
  const url = URL.createObjectURL(new Blob([text], {type:'application/json'}));
  const link = document.createElement('a');
  link.href=url; link.download=name; link.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
}
