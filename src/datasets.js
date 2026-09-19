// Imported content is plain text plus embedded raster images, never executable HTML.
export const KEY = 'togaf.custom.datasets.v1';
export const LIMIT = 10 * 1024 * 1024;
const fail = message => { throw Error(message); };
const string = (value, max, optional=false) => typeof value === 'string' && value.length <= max && (optional || value.trim().length) ? value : fail('Invalid or missing text field.');
export function validate(data) {
  if (data?.version !== 1 || !Array.isArray(data.banks) || !data.banks.length || data.banks.length > 100) fail('Expected version 1 and 1-100 banks.');
  const ids = new Set();
  return data.banks.map(b => {
    if (typeof b.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(b.id) || ids.has(b.id)) fail('Dataset IDs must be unique lowercase letters, digits or hyphens.');
    ids.add(b.id);
    if (![1,2].includes(b.part) || !Array.isArray(b.questions) || !b.questions.length || b.questions.length > 1000) fail('Each bank needs a part (1 or 2) and 1-1000 questions.');
    const numbers = new Set();
    return {id:b.id, part:b.part, title:string(b.title,200), questions:b.questions.map(q => {
      if (!Number.isSafeInteger(q.n) || q.n < 1 || numbers.has(q.n)) fail('Question numbers must be unique positive integers within each bank.');
      numbers.add(q.n);
      const result = {n:q.n,topic:string(q.topic,200),q:string(q.q,20000)};
      for (const key of ['lo','note','diagramDescription']) if (q[key] !== undefined) result[key]=string(q[key],10000,true);
      if (q.images !== undefined) {
        if (!Array.isArray(q.images) || q.images.length > 6) fail('Use up to six embedded images per question.');
        result.images=q.images.map(src => typeof src === 'string' && src.length <= 2000000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(src) ? src : fail('Images must be embedded PNG, JPEG or WebP data URLs.'));
      }
      const options=b.part===1?q.o:Object.entries(q.o || {});
      if (!Array.isArray(options) || options.length < 2 || options.length > 5 || options.some(o=>!Array.isArray(o)||o.length!==2)) fail('Invalid answer choices.');
      const labels=options.map(o=>o[0]);
      if (labels.join('') !== 'ABCDE'.slice(0,labels.length) || (b.part===2 && labels.join('')!=='ABCD')) fail('Use consecutive A-E choices (A-D for Part 2).');
      const clean=options.map(([key,value])=>[key,string(value,20000)]);
      if (b.part===1) {
        if (!labels.includes(q.a)) fail('Answer key does not match an option.');
        Object.assign(result,{o:clean,a:q.a,e:string(q.e,20000)});
      } else {
        if (!q.pts || !Object.values(q.pts).every(Number.isInteger) || Object.keys(q.pts).sort().join('')!=='ABCD' || Object.values(q.pts).sort((a,b)=>a-b).join(',')!=='0,1,3,5') fail('Part 2 scores must rank answers 5, 3, 1, 0.');
        Object.assign(result,{o:Object.fromEntries(clean),pts:Object.fromEntries(labels.map(k=>[k,q.pts[k]])),rat:Object.fromEntries(labels.map(k=>[k,string(q.rat?.[k],20000)])),stitle:string(q.stitle,500),scenario:string(q.scenario,30000)});
      }
      return result;
    })};
  });
}
export function read() {
  const raw=localStorage.getItem(KEY);
  return raw ? validate(JSON.parse(raw)) : [];
}
export function merge(current, incoming) {
  const merged=[...current];
  for (const bank of incoming) {
    const existing=merged.find(b=>b.id===bank.id);
    if (existing && JSON.stringify(existing)!==JSON.stringify(bank)) fail('Dataset '+bank.id+' already exists with different content. Use a new ID for a revision.');
    if (!existing) merged.push(bank);
  }
  if (merged.length>100) fail('At most 100 custom banks can be stored.');
  return merged;
}
export function importJSON(raw) {
  if (new TextEncoder().encode(raw).length > LIMIT) fail('Dataset exceeds the 10 MB limit.');
  const incoming=validate(JSON.parse(raw)), current=read(), merged=merge(current,incoming);
  const output=JSON.stringify({version:1,banks:merged});
  if (new TextEncoder().encode(output).length > LIMIT) fail('Combined datasets exceed the 10 MB limit.');
  localStorage.setItem(KEY,output);
  return merged.length-current.length;
}
export function asBanks(custom) {
  return custom.map(b=>({part:b.part,title:b.title,src:'custom-'+b.id,questions:b.questions.map(q=>({...q,src:'custom-'+b.id}))}));
}
