"use client";
import { useState, type CSSProperties } from 'react';
import { CalendarCard } from '../../ClassroomScene';
import { calendarFontOptions, calendarTitleOptions } from '../font-options';
import '../../classroom.css';
import './samples.css';

export function CalendarFontComparison() {
  const [name, setName] = useState('11scat');
  const [activity, setActivity] = useState('复习数据结构，整理课堂笔记');
  const [title, setTitle] = useState('chalk');
  const [category, setCategory] = useState('new');
  const titleFont=calendarTitleOptions.find(option=>option.id===title)!;
  const options=calendarFontOptions.filter(option=>category==='new' ? ['running','cursive','rounded'].includes(option.id) : !['running','cursive','rounded'].includes(option.id));
  return <main className="calendar-font-review">
    <header><a href="/classroom-preview">返回教室预览</a><h1>台历字体对比</h1><p>中文标题沿用页签的印刷字体，英文标题和活动内容分别比较；样例使用相同素材、颜色和字号。</p></header>
    <div className="font-sample-inputs"><label>人物 ID<input value={name} onChange={event => setName(event.target.value)} maxLength={40} /></label><label>正在做的事情<input value={activity} onChange={event => setActivity(event.target.value)} maxLength={80} /></label></div>
    <fieldset className="calendar-title-choices"><legend>英文标题</legend>{calendarTitleOptions.map(option=><label key={option.id}><input type="radio" name="title-font" value={option.id} checked={title===option.id} onChange={()=>setTitle(option.id)} /><span>{option.name}</span><strong style={{fontFamily:option.font}}>11scat</strong></label>)}</fieldset>
    <nav className="font-category" aria-label="活动字体候选"><button aria-pressed={category==='new'} onClick={()=>setCategory('new')}>新增风格</button><button aria-pressed={category==='previous'} onClick={()=>setCategory('previous')}>已有候选与龙藏体</button></nav>
    <section className="classroom-scene calendar-font-grid">{options.map(option => <article key={option.id} className="calendar-font-option" style={{'--calendar-hand-font': option.font,'--calendar-title-font':titleFont.font} as CSSProperties}>
      <h2>{option.name}</h2><div className="calendar-sample-desk"><CalendarCard name={name}><p>{activity}</p></CalendarCard></div><p>{option.note}</p><a href={`/classroom-preview?calendar=${option.id}&title=${title}`}>在教室里查看</a>
    </article>)}</section>
  </main>;
}
