"use client";
import { useState } from 'react';
import { ChalkMotif } from '../../ChalkMotif';
import { classroomChalkArt, type ClassroomChalkArtId } from '../../classroom-chalk-art';
import '../../classroom.css';
import './samples.css';
const choices=classroomChalkArt;
function Motif({id,small=false}:{id:ClassroomChalkArtId;small?:boolean}) {
  return <ChalkMotif name={id} size="var(--chalk-motif-size)" className={`chalk-art-motif${small?' small':''}`} decorative={false} />;
}
export function ChalkArtSamples() {
  const [small,setSmall]=useState<ClassroomChalkArtId>('stars');
  const [large,setLarge]=useState<ClassroomChalkArtId>('cat');
  return <main className="chalk-art-review">
    <header><a href="/classroom-preview">返回教室预览</a><h1>手绘粉笔图案</h1><p>柔和的粉笔涂色，留一点自然的笔迹。每款都有大小样例，也可以试着搭配两个角落。</p><a href="/classroom/chalk/handdrawn/preview.html">调整底色与大小 · 下载素材</a></header>
    <section className="chalk-art-grid">{choices.map(choice=><article key={choice.id}><div className="chalk-art-swatch"><Motif id={choice.id}/><Motif id={choice.id} small/></div><h2>{choice.name}</h2></article>)}</section>
    <div className="chalk-art-controls"><label>左上角小图案<select value={small} onChange={event=>setSmall(event.target.value as ClassroomChalkArtId)}>{choices.map(choice=><option value={choice.id} key={choice.id}>{choice.name}</option>)}</select></label><label>右下角图案<select value={large} onChange={event=>setLarge(event.target.value as ClassroomChalkArtId)}>{choices.map(choice=><option value={choice.id} key={choice.id}>{choice.name}</option>)}</select></label></div>
    <section className="chalk-art-composition" aria-label="图案大小与位置组合样例"><div className="chalk-art-corner"><Motif id={small} small/></div><div className="chalk-art-frame"><Motif id={large}/></div></section>
  </main>;
}
