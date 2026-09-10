"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Expand, Minimize2 } from 'lucide-react';
import { fittingChalkTaskCount, classroomDay, type PublicTaskPreview } from './classroom-view';

export type ClassroomPropName = 'calendar' | 'chalk-cup' | 'projector' | 'microphone' | 'camera' | 'taskboard' | 'folder' | 'settings' | 'bell';
export function ClassroomProp({ name }: { name: ClassroomPropName }) {
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
  return <span className={`classroom-prop prop-${name}`} aria-hidden="true" />;
}
export function ClassroomFullscreenIcon({ fullscreen, chalk = true }: { fullscreen: boolean; chalk?: boolean }) {
  if (!chalk) return fullscreen ? <Minimize2 size={19} aria-hidden="true" /> : <Expand size={19} aria-hidden="true" />;
  return <svg className="chalk-fullscreen-icon" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={fullscreen ? 'M4 10.4l6.8-.5-.3-6.3M21.5 3.9l-.2 6.5 6.7-.4M3.8 21.8l6.4-.2.4 6.5M21.4 28.2l.2-6.6 6.4.3' : 'M4.5 11.1l-.3-6.8 7.1.3M20.8 4.2l6.9.4-.3 6.5M4.3 21l.3 6.8 6.5-.4M21 27.5l6.6.3.2-7'} />
    <path opacity=".85" d="m5.3 5.7 6 6.3m15-6.5-6.4 6.7M5.4 26.1l6.4-6m14.4 6.2-6.1-6.6" />
  </svg>;
}
export function useProjectionCurtain(source: object | undefined, boardOpen = false) {
  const [foldedSource, setFoldedSource] = useState<object | null>(null);
  return {
    open: !!source && source !== foldedSource && !boardOpen,
    toggle: () => { if (source) setFoldedSource(current => current === source ? null : source); },
    reveal: () => setFoldedSource(null),
  };
}
export function ProjectorControl({ open, hasSource, disabled, onClick }: { open: boolean; hasSource: boolean; disabled?: boolean; onClick: () => void }) {
  const label = open ? '收起投影' : hasSource ? '展开投影' : '共享屏幕';
  return <button className="object-button projector-control" type="button" disabled={disabled} onClick={onClick} aria-label={label} title={label} aria-expanded={open}>
    <ClassroomProp name="projector" />
  </button>;
}
export function EmergencyExit({ onClick }: { onClick?: () => void }) {
  return <button className="wall-exit" type="button" aria-label="退出自习室" title="退出自习室" onClick={onClick}>
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
    <ul className="chalk-public-tasks">{rows(candidates.slice(0, visibleCount))}</ul>
    <ul className="chalk-public-tasks chalk-task-measure" ref={measurement} aria-hidden="true">{rows(candidates)}</ul>
  </div>;
}
export function CalendarCard({ name, projecting, onView, children }: { name: string; projecting?: boolean; onView?: () => void; children: ReactNode }) {
  return <section className={`desk-calendar${projecting ? ' projecting' : ''}`} aria-label={`${name}的个人卡片`}>
    <ClassroomProp name="calendar" />
    <div className="calendar-content">{onView ? <button className="calendar-name" type="button" onClick={onView} title={`查看${name}的共享画面`}>{name}</button> : <strong className="calendar-name">{name}</strong>}{children}</div>
  </section>;
}
