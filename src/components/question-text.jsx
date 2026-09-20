import React from 'react';
import {questionTextBlocks} from '../question-text';

export function QuestionText({text,heading=false,className=''}) {
  return <div className={'formatted-text '+className}>{questionTextBlocks(text).map((block,i)=>{
    if(block.items) {
      const List=block.type==='ordered'?'ol':'ul';
      return <List key={i}>{block.items.map((item,n)=><li key={n}>{item}</li>)}</List>;
    }
    const Tag=heading&&i===0?'h2':'p';
    return <Tag key={i} className={block.type==='label'?'text-label':undefined}>{block.type==='label'?<strong>{block.text}</strong>:block.text}</Tag>;
  })}</div>;
}
