const sections = /(^|\s)(Output\s*(?:&|and)\s*Outcome|Essential Knowledge|Scenario|Role):\s*/gi;
const segmenter = new Intl.Segmenter('en', {granularity:'sentence'});

function sentences(text) {
  const result=[];
  for (const {segment} of segmenter.segment(text)) {
    let rest=segment.trim();
    // A parenthetical note belongs to the preceding sentence.
    const note=rest.match(/^(\([^()]*\))\s*/);
    if(note && result.length) {result[result.length-1]+=' '+note[1];rest=rest.slice(note[0].length);}
    if(rest)result.push(rest);
  }
  return result;
}

function paragraphs(text) {
  if(text.length<600)return [text];
  const result=[];
  let paragraph='';
  for(const sentence of sentences(text)) {
    if(paragraph.length>=240 && paragraph.length+sentence.length>480) {result.push(paragraph);paragraph='';}
    paragraph+=(paragraph?' ':'')+sentence;
  }
  if(paragraph)result.push(paragraph);
  return result;
}

export function questionTextBlocks(text) {
  const prepared=text.replace(/\r\n?/g,'\n').replace(sections,(_,space,label)=>`\n\n${label}:\n`).trim();
  const blocks=[];
  for(const paragraph of prepared.split(/\n\s*\n/).filter(Boolean)) {
    const heading=paragraph.match(/^([^\n:]+):\n/);
    let body=heading?paragraph.slice(heading[0].length):paragraph;
    const numbered=[...body.matchAll(/(?:^|\s)(\(?([1-9]\d?)[.):])\s+/g)];
    const list=numbered.length>1 && numbered.every((m,i)=>Number(m[2])===i+1) &&
      (!body.slice(0,numbered[0].index).trim() || body.slice(0,numbered[0].index).trim().endsWith(':'));
    let prompt='';
    if(heading||list) {
      const final=body.match(/\s+((?:Which|What|How|Select|Choose)\b[^?.!\n]*\?)\s*$/);
      if(final){prompt=final[1];body=body.slice(0,final.index).trim();}
    }
    if(heading)blocks.push({type:'label',text:heading[1]+':'});
    if(list) {
      const intro=body.slice(0,numbered[0].index).trim();
      if(intro)blocks.push({type:'paragraph',text:intro});
      blocks.push({type:'ordered',items:numbered.map((m,i)=>body.slice(m.index+m[0].length,numbered[i+1]?.index??body.length).trim())});
    } else if(/^Essential Knowledge:/i.test(heading?.[0]||'')) {
      const items=body.includes('; ')?body.split(/;\s+/):sentences(body);
      if(items.length>1)blocks.push({type:'unordered',items});
      else if(body)blocks.push({type:'paragraph',text:body});
    } else {
      const lines=body.split('\n');
      if(lines.length>1 && lines.every(line=>/^\s*[-*\u2022]\s+/.test(line))) {
        blocks.push({type:'unordered',items:lines.map(line=>line.replace(/^\s*[-*\u2022]\s+/,''))});
      } else for(const text of paragraphs(body))if(text)blocks.push({type:'paragraph',text});
    }
    if(prompt)blocks.push({type:'paragraph',text:prompt});
  }
  return blocks;
}
