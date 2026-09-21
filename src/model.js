import * as datasets from './datasets.js';
import {initializeCloud} from './cloud-client.js';
if(window.TOGAF_HOSTED&&!window.TOGAF_CLOUD?.user?.id) throw Error('Account bootstrap unavailable. Reload or sign in again.');
// The standalone engine owns mixing, grading and backward-compatible backup validation.
export const stats = window.TogafStats;
export const banks = window.TOGAF_BANKS;
const bundled = banks.map(b=>({...b,dataset:'generated',datasetTitle:'Generated'}));
export let disabledDatasets = new Set();
export let datasetError = '';
export function reloadDatasets() {
  try {
    const disabled=JSON.parse(localStorage.getItem(datasets.SELECTION_KEY)||'[]');
    if (!Array.isArray(disabled)||disabled.some(id=>typeof id!=='string')) throw Error('Invalid dataset selection.');
    disabledDatasets=new Set(disabled);
    banks.splice(0,banks.length,...bundled,...datasets.asBanks(datasets.merge(datasets.read(),window.TOGAF_PRIVATE_DATASETS||[],{replaceImages:true}))); datasetError=''; }
  catch (error) { datasetError='Custom datasets unavailable: '+error.message; }
}
reloadDatasets();
initializeCloud(stats,reloadDatasets);
export const t = (text, values = {}) => text.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(values, key) ? values[key] : match);
export const href = path => new URL(path, new URL(window.TOGAF_BASE || './', location.href)).href;
export const score = (part, q, choice) => window.TogafExam.scoreOf.call({part}, q, choice);
export const best = (part, q) => window.TogafExam.bestKey.call({part}, q);
export const percent = (earned, max) => max ? Math.round(earned / max * 100) : 0;
export const time = ms => `${Math.floor(ms / 60000).toString().padStart(2,'0')}:${Math.floor(ms / 1000 % 60).toString().padStart(2,'0')}`;

export const shuffle = values => window.TogafExam.shuffle(values);
// "All/None of the above" only makes sense as the last option, so shuffle around it.
const optionKeys = (part, o) => {
  const text = key => part===1 ? o.find(x=>x[0]===key)[1] : o[key];
  const keys = shuffle(part===1 ? o.map(x=>x[0]) : Object.keys(o));
  return [...keys.filter(k=>!/of the above/i.test(text(k))), ...keys.filter(k=>/of the above/i.test(text(k)))];
};

export const datasetId = bank => bank.dataset;
export function datasetGroups(pool=banks) {
  const groups=new Map();
  for (const b of pool) {
    const id=datasetId(b), group=groups.get(id)||{id,title:b.datasetTitle||b.title,count:0};
    group.count+=b.questions.length;groups.set(id,group);
  }
  return [...groups.values()];
}
export function setDatasetEnabled(id,enabled) {
  const next=new Set(disabledDatasets);
  enabled?next.delete(id):next.add(id);
  localStorage.setItem(datasets.SELECTION_KEY,JSON.stringify([...next]));
  disabledDatasets=next;
  window.TogafCloud?.selectionChanged(id,enabled);
}
export const selectBanks = () => banks.filter(b=>!disabledDatasets.has(datasetId(b)));
export function selectRuns(runs) {
  const ids=new Set(selectBanks().flatMap(b=>b.questions.map(q=>stats.qid(q,b.src))));
  return runs.map(r=>({...r,items:r.items.filter(i=>ids.has(i.id))})).filter(r=>r.items.length);
}

export function practiceFilter({part,topics,selection},runs) {
  const ids=selection==='most-mistakes'?stats.mistakes(part,runs):selection==='latest-mistakes'
    ?new Set(stats.latest(part,runs).filter(q=>q.earned<q.max).map(q=>q.id)):null;
  return q=>topics.has(q.topic)&&(!ids||ids.has(stats.qid(q)));
}

export function prepare({part, count, topics, selection='unseen', mode, source}, runs) {
  const seen = new Set(stats.latest(part,runs).map(q=>q.id));
  const ranked=selection==='most-mistakes';
  if(ranked&&(!Number.isInteger(count)||count<0))throw Error('Invalid practice selection.');
  let questions = window.TogafExam.mix(selectBanks().filter(b=>!source||datasetId(b)===source||b.src===source), part, ranked?0:count,
    practiceFilter({part,topics,selection},runs),
    q => selection!=='unseen' || !seen.has(stats.qid(q)));
  if(ranked) {
    const mistakes=stats.mistakes(part,runs);
    // The mixed pool randomizes ties; rank before applying the requested session length.
    questions.sort((a,b)=>mistakes.get(stats.qid(b))-mistakes.get(stats.qid(a)));
    questions=questions.slice(0,count||questions.length);
  }
  if (questions.length>1000) throw Error('Choose at most 1000 questions per session.');
  if (!questions.length) throw Error(t('No questions match. Widen the topics or change question selection.'));
  return {part, mode, questions:questions.map((q,i) => ({...q,n:i+1,keys:optionKeys(part,q.o)})), responses:{}, index:0, started:0};
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
