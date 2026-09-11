"use client";
import { useState } from 'react';
import { DeviceCard } from '../../ClassroomDevices';
import '../../classroom.css';
import './samples.css';
const choices = [
  {id:'resource-rounded',name:'资源圆体 + Nunito · 当前使用',note:'随网站提供字库，保留柔和的圆角笔画。'},
  {id:'sans',name:'Noto Sans SC',note:'清楚、简洁的屏幕印刷体。'},
  {id:'rounded',name:'站酷快乐体 + Nunito',note:'中文、英文和数字字库均由网站提供。'},
];
export function DeviceFontComparison() {
  const [name,setName]=useState('11scat'),[activity,setActivity]=useState('复习数据结构，整理课堂笔记');
  return <main className="calendar-font-review">
    <header><a href="/classroom-preview">返回教室预览</a><h1>设备字体对比</h1><p>名字和活动内容使用同一种屏幕字体，两张桌子的材质和设备比例保持一致。</p></header>
    <div className="font-sample-inputs"><label>人物 ID<input value={name} maxLength={24} onChange={event=>setName(event.target.value)}/></label><label>正在做的事情<input value={activity} maxLength={80} onChange={event=>setActivity(event.target.value)}/></label></div>
    <section className="calendar-font-grid classroom-scene">{choices.map(choice=><article key={choice.id} className="calendar-font-option device-font-option classroom-scene" data-device-font={choice.id}>
      <h2>{choice.name}</h2><DeviceCard font={choice.id} kind="tablet" name={name} online screen camera self={false}><p>{activity}</p></DeviceCard><DeviceCard font={choice.id} kind="laptop" name={name} online screen={false} camera={false} self={false}><p>{activity}</p></DeviceCard><p>{choice.note}</p><a href={'/classroom-preview?font='+choice.id}>在教室里查看</a>
    </article>)}</section>
  </main>;
}
