"use client";
import { useState } from 'react';
import { Check, Paperclip, Mic, Send } from 'lucide-react';
import { CalendarCard, ClassroomFullscreenIcon, ClassroomProp, EmergencyExit, IdleChalkboard, ProjectorControl, useClassroomDate, useProjectionCurtain } from '../ClassroomScene';
import { ProjectionSample } from './ProjectionSample';
import { Whiteboard, type RoomBoard } from '../Whiteboard';
import { INITIAL_BOARD_EPOCH, normalizeBoard } from '../board-state';
import { useMainFullscreen } from '../use-main-fullscreen';
import '../main-fullscreen.css';
import '../classroom.css';

const previewSource = {};
const previewTasks = [{id:'one',title:'整理今天的课堂笔记'}, {id:'two',title:'完成数据结构练习'}, {id:'three',title:'一起复习本周的内容'}];
const additionalTasks = ['补充实验报告', '整理错题', '完成阅读记录', '准备下次讨论', '核对本周作业', '复习上节课的例题', '整理学习资料'].map((title, index) => ({id:`extra-${index}`, title}));
const extendedTasks = [...previewTasks, ...additionalTasks];
export function ClassroomPreview({ calendarFont = 'pen' }: { calendarFont?: 'pen' | 'brush' | 'yan' }) {
  const date = useClassroomDate();
  const [side, setSide] = useState('chat');
  const [mode, setMode] = useState('idle');
  const [moreTasks, setMoreTasks] = useState(false);
  const projection = useProjectionCurtain(mode === 'projection' ? previewSource : undefined);
  const selectMode = (next: string) => { projection.reveal(); setMode(next); };
  const { stageRef, fullscreen, toggleFullscreen } = useMainFullscreen();
  const [board,setBoard]=useState<RoomBoard>({id:'e6f461d2-0b17-4606-a916-eac86c03bab7',name:'画板',strokes:[],texts:[],deletedStrokeIds:[],deletedTextIds:[],epoch:INITIAL_BOARD_EPOCH,createdAt:1});
  const [notice, setNotice]=useState('');
  return <main className="app-shell classroom-scene" data-calendar-font={calendarFont} aria-label="本地教室外观预览">
    <section className="workspace">
      <section className="focus-stage panel"><div className="share-canvas" ref={stageRef}>
        <ProjectorControl open={projection.open} hasSource={mode === "projection"} onClick={() => mode === "projection" ? projection.toggle() : selectMode("projection")} />
        {mode!=='board' && !projection.open && <IdleChalkboard date={date} tasks={moreTasks ? extendedTasks : previewTasks} />}
        <div className={projection.open?'projection-sheet is-open':'projection-sheet'} aria-hidden={!projection.open}>{projection.open && <ProjectionSample />}</div>
        {mode==='board' && <Whiteboard board={board} fullscreen={fullscreen} onToggleFullscreen={toggleFullscreen} onAddStroke={(stroke,epoch)=>setBoard(current=>current.epoch===epoch?{...current,strokes:[...current.strokes.filter(s=>s.id!==stroke.id),stroke]}:current)} onDeleteStroke={(id)=>setBoard(current=>({...current,strokes:current.strokes.filter(s=>s.id!==id),deletedStrokeIds:[...current.deletedStrokeIds,id]}))} onClear={()=>setBoard(current=>({...current,strokes:[],texts:[],epoch:Date.now()+':clear'}))} onUpsertText={text=>setBoard(current=>({...current,texts:[...current.texts.filter(t=>t.id!==text.id),text]}))} onDeleteText={id=>setBoard(current=>({...current,texts:current.texts.filter(t=>t.id!==id),deletedTextIds:[...current.deletedTextIds,id]}))} onSaved={message=>setNotice(message)} onExport={async blob=>{const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='classroom-board.png';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}} />}
        {mode!=='board' && <button className={`main-fullscreen-button${projection.open ? '' : ' is-chalk'}`} aria-label={fullscreen ? '退出主窗口全屏' : '主窗口全屏'} onClick={()=>void toggleFullscreen()}><ClassroomFullscreenIcon fullscreen={fullscreen} chalk={!projection.open} /></button>}
        <div className="board-ledge" aria-hidden="true"><div className="ledge-decoration"><span className="chalk-eraser" /><span className="chalk-stick" /><span className="chalk-stick" style={{background:'#efd28a'}} /><span className="chalk-stick" style={{background:'#a4c5de'}} /><span className="chalk-stick" style={{background:'#e0a7b5'}} /></div></div>
      </div></section>
      <aside className="side-panel panel"><div className="side-tabs"><button className={side==='chat'?'active':''} onClick={()=>setSide('chat')}>传纸条</button><button className={side==='tasks'?'active':''} onClick={()=>setSide('tasks')}>同桌</button><div className="chat-bell-host"><button className="room-bell-trigger" aria-label="摇铃"><ClassroomProp name="bell" /></button></div></div>
      {side==='chat'? <div className="chat-view"><div className="message-list"><div className="message"><span>11 · 10:24</span><p>今天先把作业做完，再一起看看昨天的笔记。</p></div><div className="message own"><span>11scat · 10:24</span><p>好，做完了在任务板提交。</p></div></div><form className="chat-form" onSubmit={e=>e.preventDefault()}><div className="chat-input-row"><button className="chat-attach-button" aria-label="添加附件"><Paperclip /></button><button className="voice-record-button" aria-label="录音"><Mic /></button><textarea aria-label="输入房间消息" rows={2}/><button className="primary-button chat-send-button" aria-label="发送"><Send size={16}/></button></div></form></div>:
      <div className="task-view"><div className="task-scroll">{['11','11scat'].map((name,i)=><section className="task-person-card" key={name}><div className="activity-heading"><strong>{name}</strong></div><div className="task-person-list"><div className="task-list">{previewTasks.slice(i).map(t=><div className="task-row" key={t.id}><span className="custom-check"><Check size={14}/></span><span className="task-copy"><strong>{t.title}</strong></span></div>)}</div></div></section>)}</div></div>}</aside>
    </section>
    <div className="scene-desks"><div className="classroom-desk"><CalendarCard name="11"><form className="activity-box" onSubmit={e=>e.preventDefault()}><input aria-label="我正在" defaultValue="复习数据结构" maxLength={80}/></form></CalendarCard></div><div className="classroom-desk"><CalendarCard name="11scat"><p>整理课堂笔记</p></CalendarCard></div><div className="classroom-desk desk-media">{(['chalk-cup','microphone','camera'] as const).map((name,i)=><button className="object-button" key={name} aria-label={['画板','麦克风','摄像头'][i]} onClick={i===0?()=>selectMode(mode==='board'?'idle':'board'):undefined}><ClassroomProp name={name}/></button>)}</div><div className="classroom-desk desk-room">{(['taskboard','folder','settings'] as const).map((name,i)=><button className="object-button" key={name} aria-label={['任务板','云盘','设置'][i]}><ClassroomProp name={name}/></button>)}</div></div>
    <EmergencyExit />
    <div className="classroom-preview-toolbar" aria-label="本地预览工具"><span>本地预览</span>{[['idle','待机'],['projection','投影'],['board','画板']].map(([value,label])=><button key={value} onClick={()=>selectMode(value)} aria-pressed={mode===value}>{label}</button>)}<button onClick={()=>setMoreTasks(value=>!value)} aria-pressed={moreTasks}>更多任务</button><a href="/classroom-preview/fonts">台历字体对比</a><button onClick={()=>{const next=normalizeBoard(JSON.parse(JSON.stringify(board)));if(next)setBoard(next);setNotice('已重新载入');}}>重新载入笔迹</button>{mode==='board' && <span>{board.strokes.length} 笔 · {board.strokes.at(-1)?.points.length || 0} 点</span>}{notice && <span role="status">{notice}</span>}</div>
  </main>;
}
