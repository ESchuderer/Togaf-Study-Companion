(function(root) {
function validRun(r) {
  const str=(v,n)=>typeof v==='string'&&v.length>0&&v.length<=n;
  return r && [1,2].includes(r.part) && str(r.title,300) && Number.isSafeInteger(r.ts) && r.ts>0 &&
    Number.isFinite(r.score) && Number.isFinite(r.max) && r.max>0 && r.score>=0 && r.score<=r.max &&
    (r.id===undefined || str(r.id,200)) && Array.isArray(r.items) && r.items.length>0 && r.items.length<=1000 &&
    r.items.every(i=>i && str(i.id,500) && str(i.topic,200) && i.max===(r.part===1?1:5) &&
      Number.isInteger(i.earned) && (r.part===1?[0,1]:[0,1,3,5]).includes(i.earned) &&
      (i.sel===undefined || i.sel===null || /^[A-E]$/.test(i.sel))) &&
    new Set(r.items.map(i=>i.id)).size===r.items.length &&
    r.score===r.items.reduce((n,i)=>n+i.earned,0) && r.max===r.items.reduce((n,i)=>n+i.max,0);
}
function validFeedback(f) {
  return f && typeof f.id==='string' && /^[\w-]{1,100}$/.test(f.id) &&
    typeof f.question==='string' && f.question.length>0 && f.question.length<=500 &&
    [1,2].includes(f.part) && ['confusing','possible-error','note'].includes(f.kind) &&
    typeof f.text==='string' && f.text.trim().length>0 && f.text.length<=4000 && Number.isSafeInteger(f.ts) && f.ts>0;
}
const records={validRun,validFeedback};
if(typeof module !== "undefined") module.exports=records;
else root.TogafRecords=records;
})(typeof window === "undefined" ? globalThis : window);
