"use client";

import { useEffect, useState, type ReactNode } from 'react';
import { chalkTaskPreview, classroomDay, type PublicTaskPreview } from './classroom-view';

export type ClassroomPropName = 'calendar' | 'chalk-cup' | 'projector' | 'microphone' | 'camera' | 'taskboard' | 'folder' | 'settings' | 'bell';
export function ClassroomProp({ name }: { name: ClassroomPropName }) {
  return <span className={`classroom-prop prop-${name}`} aria-hidden="true" />;
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
  const dateText = date ? new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', weekday: 'short', month: 'short', day: '2-digit' }).format(date).toUpperCase() : '';
  return <div className="idle-chalkboard">
    <time className="chalk-date" dateTime={date ? classroomDay(date) : undefined}>{dateText}</time>
    <ul className="chalk-public-tasks">{chalkTaskPreview(tasks).map(task => <li key={task.id}><span className="chalk-lettering">{task.title}</span></li>)}</ul>
  </div>;
}
export function CalendarCard({ name, projecting, onView, children }: { name: string; projecting?: boolean; onView?: () => void; children: ReactNode }) {
  return <section className={`desk-calendar${projecting ? ' projecting' : ''}`} aria-label={`${name}的个人卡片`}>
    <ClassroomProp name="calendar" />
    <div className="calendar-content">{onView ? <button className="calendar-name" type="button" onClick={onView} title={`查看${name}的共享画面`}>{name}</button> : <strong className="calendar-name">{name}</strong>}{children}</div>
  </section>;
}
