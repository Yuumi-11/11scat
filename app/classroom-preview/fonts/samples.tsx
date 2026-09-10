"use client";
import { useState, type CSSProperties } from 'react';
import { CalendarCard } from '../../ClassroomScene';
import '../../classroom.css';
import './samples.css';

const options = [
  { id: 'pen', name: '霞鹜文楷', font: '"School Calendar Pen", cursive', note: '接近硬笔书写，小字较清楚。当前本地暂用这一款。' },
  { id: 'brush', name: '马善政毛笔楷书', font: '"School Calendar Brush", "School Calendar Pen", cursive', note: '笔画更厚，毛笔感明显，数字和字母也采用同一字体。' },
  { id: 'yan', name: '辰宇落雁体', font: '"Classroom Yan", "Long Cang", cursive', note: '笔画纤细、手写感强，缺少的简体字使用龙藏体补充。' },
];

export function CalendarFontComparison() {
  const [name, setName] = useState('11scat');
  const [activity, setActivity] = useState('复习数据结构，整理课堂笔记');
  return <main className="calendar-font-review">
    <header><a href="/classroom-preview">返回教室预览</a><h1>台历手写体对比</h1><p>三张台历使用相同素材、颜色和字号，输入内容会同步到各个样例。</p></header>
    <div className="font-sample-inputs"><label>人物 ID<input value={name} onChange={event => setName(event.target.value)} maxLength={40} /></label><label>正在做的事情<input value={activity} onChange={event => setActivity(event.target.value)} maxLength={80} /></label></div>
    <section className="classroom-scene calendar-font-grid">{options.map(option => <article key={option.id} className="calendar-font-option" style={{'--calendar-hand-font': option.font} as CSSProperties}>
      <h2>{option.name}</h2><div className="calendar-sample-desk"><CalendarCard name={name}><p>{activity}</p></CalendarCard></div><p>{option.note}</p><a href={`/classroom-preview?calendar=${option.id}`}>在教室里查看</a>
    </article>)}</section>
  </main>;
}
