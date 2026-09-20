import assert from 'node:assert/strict';
import {questionTextBlocks} from '../src/question-text.js';

const sample='Read this description: Output & Outcome: An agreed plan. Essential Knowledge: Available people. (Capacity) How capacity changes with demand. (Schedule) Which phase fits?';
const blocks=questionTextBlocks(sample);
assert.deepEqual(blocks,[
  {type:'paragraph',text:'Read this description:'},
  {type:'label',text:'Output & Outcome:'},
  {type:'paragraph',text:'An agreed plan.'},
  {type:'label',text:'Essential Knowledge:'},
  {type:'unordered',items:['Available people. (Capacity)','How capacity changes with demand. (Schedule)']},
  {type:'paragraph',text:'Which phase fits?'}
]);
for(const mark of [')',':','.']) {
  const result=questionTextBlocks(`Match these: 1${mark} First item; 2${mark} Second item. Which pairing fits?`);
  assert.deepEqual(result,[{type:'paragraph',text:'Match these:'},{type:'ordered',items:['First item;','Second item.']},{type:'paragraph',text:'Which pairing fits?'}]);
}
assert.equal(questionTextBlocks('See section 1.2 and version 2.0.')[0].text,'See section 1.2 and version 2.0.');
assert.equal(questionTextBlocks('Phase A: Architecture Vision')[0].text,'Phase A: Architecture Vision');
assert.equal(questionTextBlocks('Scenario: Context. Role: Reviewer.').filter(b=>b.type==='label').length,2);
assert.equal(questionTextBlocks('First paragraph.\n\nSecond paragraph.').length,2);
assert.deepEqual(questionTextBlocks('- First\n- Second'),[{type:'unordered',items:['First','Second']}]);
assert.equal(questionTextBlocks('<b>Keep as text</b>')[0].text,'<b>Keep as text</b>');
const prose='This is a complete sentence describing the context and responsibilities of the project team. '.repeat(10).trim();
const paragraphs=questionTextBlocks(prose);
assert.ok(paragraphs.length>1);
assert.equal(paragraphs.map(b=>b.text).join(' '),prose);
console.log('PASS: sections, contextual notes, ordered lists, paragraph spacing, decimals and literal HTML.');
