"use client";
import { useState } from 'react';
import '../../classroom.css';
import './samples.css';
const choices=[{id:'heart',name:'爱心'},{id:'stars',name:'星星'},{id:'balloons',name:'气球'},{id:'cat',name:'猫咪'}];
function Motif({id,small=false}:{id:string;small?:boolean}) {
  return <span className={`chalk-art-motif${small?' small':''}`} role="img" aria-label={choices.find(choice=>choice.id===id)?.name} style={{backgroundImage:`url('/classroom/chalk/${id}.svg')`}} />;
}
export function ChalkArtSamples() {
  const [small,setSmall]=useState('stars');
  const [large,setLarge]=useState('cat');
  return <main className="chalk-art-review">
    <header><a href="/classroom-preview">返回教室预览</a><h1>第一批粉笔图案</h1><p>同一套线条、粉笔颗粒与配色。这里只查看素材和大小组合，尚未接入每日更换或房间同步。</p></header>
    <section className="chalk-art-grid">{choices.map(choice=><article key={choice.id}><div className="chalk-art-swatch"><Motif id={choice.id}/><Motif id={choice.id} small/></div><h2>{choice.name}</h2></article>)}</section>
    <div className="chalk-art-controls"><label>左上角小图案<select value={small} onChange={event=>setSmall(event.target.value)}>{choices.map(choice=><option value={choice.id} key={choice.id}>{choice.name}</option>)}</select></label><label>右下角图案<select value={large} onChange={event=>setLarge(event.target.value)}>{choices.map(choice=><option value={choice.id} key={choice.id}>{choice.name}</option>)}</select></label></div>
    <section className="chalk-art-composition" aria-label="图案大小与位置组合样例"><div className="chalk-art-corner"><Motif id={small} small/></div><div className="chalk-art-frame"><Motif id={large}/></div></section>
  </main>;
}
