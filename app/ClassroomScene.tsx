"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Expand, Minimize2 } from 'lucide-react';
import { fittingChalkTaskCount, classroomDay, type PublicTaskPreview } from './classroom-view';
import { CHALK_COLORS } from './board-painter.mjs';
import { playBoardSlideSound } from './board-slide-sound';

export type ClassroomPropName = 'calendar' | 'calendar-entry' | 'chalk-cup' | 'projector' | 'microphone' | 'camera' | 'taskboard' | 'folder' | 'settings' | 'bell';
export function ClassroomProp({ name, active = false }: { name: ClassroomPropName; active?: boolean }) {
  if (name === 'bell') return <svg className="classroom-prop prop-bell" viewBox="0 0 90 110" aria-hidden="true">
    <g className="bell-mount"><path fill="#786448" d="M72 10h9v42h-9z" /><path d="M76 21H51q-13 0-13 14v9" fill="none" stroke="#786448" strokeWidth="7" strokeLinecap="round" /></g>
    <g className="bell-body">
      <path fill="#bc9347" d="M33 43v-7h11v7z" />
      <path fill="#d6ae58" d="M38 40c-13 0-17 14-18 29l-8 16q25 11 53 0l-9-16C55 54 52 40 38 40z" />
      <path fill="#e7c878" d="M27 54q3-9 10-10c-6 10-7 22-9 31l-7 7c4-10 4-21 6-28z" />
      <path fill="#aa833e" d="M13 83q25 6 51 0l2 4q-27 10-55 0z" />
      <path fill="#b58a41" d="M33 90h12q1 12-6 12t-6-12z" />
    </g>
  </svg>;
  return <span className={`classroom-prop prop-${name}${active ? ' is-on' : ''}`} aria-hidden="true" />;
}
export function ClassroomFullscreenIcon({ fullscreen, chalk = true }: { fullscreen: boolean; chalk?: boolean }) {
  if (!chalk) return fullscreen ? <Minimize2 size={19} aria-hidden="true" /> : <Expand size={19} aria-hidden="true" />;
  return <ChalkToolIcon name={fullscreen ? 'collapse' : 'expand'} />;
}
export function ChalkToolIcon({ name }: { name: 'expand' | 'collapse' | 'text' | 'clear' | 'save' | 'close' }) {
  return <span className="chalk-tool-icon" style={{ backgroundImage: `url('/classroom/chalk/${name}.svg')` }} aria-hidden="true" />;
}
export function useProjectionCurtain(source: object | undefined, boardOpen = false) {
  const [expanded, setExpanded] = useState(false);
  return {
    open: expanded && !boardOpen,
    working: !!source,
    toggle: () => setExpanded(current => !current),
    reveal: () => setExpanded(true),
    fold: () => setExpanded(false),
  };
}
export function ProjectorControl({ open, hasSource, disabled, onClick }: { open: boolean; hasSource: boolean; disabled?: boolean; onClick: () => void }) {
  const label = open ? '收起投影' : '展开投影';
  return <button className={`object-button projector-control${hasSource ? ' is-working' : ''}`} type="button" disabled={disabled} onClick={onClick} aria-label={label}  aria-expanded={open} data-working={hasSource}>
    <ClassroomProp name="projector" active={hasSource} />
  </button>;
}
export function BoardLayerNavigation({ index, count, onStep }: { index: number; count: number; onStep: (direction: -1 | 1) => void }) {
  return <div className="board-layer-navigation" aria-label="推拉黑板">
    {index > 0 && <button className="board-layer-side previous" type="button" aria-label="前一块黑板"  onClick={() => { playBoardSlideSound(); onStep(-1); }} />}
    {index < count - 1 && <button className="board-layer-side next" type="button" aria-label="后一块黑板"  onClick={() => { playBoardSlideSound(); onStep(1); }} />}
    <span className="board-layer-position" aria-label={`第 ${index + 1} 块，共 ${count} 块黑板`}>{index + 1} / {count}</span>
  </div>;
}
export function BlackboardSurface({ index, count, onStep, drawing, children }: {
  index: number; count: number; onStep: (direction: -1 | 1) => void; drawing: boolean; children: ReactNode;
}) {
  const front = useRef<HTMLDivElement>(null);
  const previousIndex = useRef(index);
  useLayoutEffect(() => {
    const direction = Math.sign(index - previousIndex.current);
    previousIndex.current = index;
    if (!direction || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const animation = front.current?.animate?.([
      { transform: `translateX(${direction * 36}px)`, opacity: .7 },
      { transform: 'translateX(0)', opacity: 1 },
    ], { duration: 300, easing: 'cubic-bezier(.2,.75,.25,1)' });
    return () => animation?.cancel();
  }, [index]);
  return <div className="blackboard-cabinet" data-has-previous={index > 0} data-has-next={index < count - 1}>
    <div className="blackboard-back" aria-hidden="true" />
    <div className="blackboard-front" ref={front}>
      {children}
      <div className="board-ledge" aria-hidden="true" />
      {!drawing && <div className="chalk-palette idle-chalk-palette" aria-hidden="true">
        <span className="chalk-slot ledge-eraser"><span className="chalk-eraser" /></span>
        {CHALK_COLORS.map(item => <span className="chalk-slot chalk-choice" key={item.color}><span className="chalk-stick" style={{ background: item.color }} /></span>)}
        <span className="rainbow-chalk chalk-slot-empty" />
      </div>}
    </div>
    <BoardLayerNavigation index={index} count={count} onStep={onStep} />
  </div>;
}
export function EmergencyExit({ onClick }: { onClick?: () => void }) {
  return <button className="wall-exit" type="button" aria-label="退出自习室"  onClick={onClick}>
    <span className="emergency-exit-sign" aria-hidden="true" />
  </button>;
}
export function useClassroomDate() {
  const [date, setDate] = useState<Date | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer); const now = new Date(); setDate(now);
      // Schedule the next Shanghai midnight, with no network polling.
      const next = Date.parse(`${classroomDay(now)}T00:00:00+08:00`) + 86400000;
      timer = setTimeout(update, Math.max(1000, next - now.getTime() + 50));
    };
    const visible = () => { if (!document.hidden) update(); };
    update(); document.addEventListener('visibilitychange', visible);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', visible); };
  }, []);
  return date;
}
export function IdleChalkboard({ date, tasks }: { date: Date | null; tasks: PublicTaskPreview[] }) {
  const measurement = useRef<HTMLUListElement>(null);
  const [visibleCount, setVisibleCount] = useState(0);
  const candidates = tasks.filter(task => task.title.trim());
  useLayoutEffect(() => {
    const list = measurement.current;
    if (!list) return;
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const heights = Array.from(list.children, child => child.getBoundingClientRect().height);
      setVisibleCount(fittingChalkTaskCount(heights, list.clientHeight, parseFloat(getComputedStyle(list).rowGap) || 0));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    Array.from(list.children).forEach(child => observer.observe(child));
    void document.fonts.ready.then(measure);
    document.fonts.addEventListener('loadingdone', measure);
    return () => { cancelled = true; observer.disconnect(); document.fonts.removeEventListener('loadingdone', measure); };
  }, [tasks]);
  const rows = (items: PublicTaskPreview[]) => items.map(task => <li key={task.id}><span className="chalk-lettering">{task.title}</span></li>);
  const dateText = date ? new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', weekday: 'short', month: 'short', day: '2-digit' }).format(date).toUpperCase() : '';
  return <div className="idle-chalkboard">
    <time className="chalk-date" dateTime={date ? classroomDay(date) : undefined}>{dateText}</time>
    <ul className={`chalk-public-tasks${visibleCount === 0 && candidates.length ? ' chalk-task-overflow' : ''}`} tabIndex={visibleCount === 0 && candidates.length ? 0 : undefined} >{rows(candidates.slice(0, Math.max(1, visibleCount)))}</ul>
    <ul className="chalk-public-tasks chalk-task-measure" ref={measurement} aria-hidden="true">{rows(candidates)}</ul>
  </div>;
}
export function CalendarCard({ name, projecting, onView, children }: { name: string; projecting?: boolean; onView?: () => void; children: ReactNode }) {
  const nameClass = `calendar-name ${/\p{Script=Han}/u.test(name) ? 'calendar-name-chinese' : 'calendar-name-latin'}`;
  return <section className={`desk-calendar${projecting ? ' projecting' : ''}`} aria-label={`${name}的个人卡片${projecting ? '，正在投影' : ''}`}>
    <ClassroomProp name="calendar" />
    <div className="calendar-content">{onView ? <button className={nameClass} type="button" onClick={onView} aria-label={`查看${name}的共享画面`}>{name}</button> : <strong className={nameClass}>{name}</strong>}{children}</div>
  </section>;
}
