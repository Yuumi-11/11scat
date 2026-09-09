"use client";

import { useState } from "react";
import type { ClaimWorkflow, TaskFields, WorkflowCommand } from "./collaboration-types";

const dateInput = (date: string | null, allDay: boolean) => date ? new Date(Date.parse(date) + 8 * 3600000).toISOString().slice(0, allDay ? 10 : 16) : "";
const apiDate = (text: string, allDay: boolean, end = false) => text ? `${text}${allDay ? end ? "T23:59:00" : "T00:00:00" : ":00"}+0800` : null;

export function WorkflowSettings({ workflow, disabled, perform }: { workflow: ClaimWorkflow; disabled: boolean; perform: (command: WorkflowCommand) => Promise<boolean> }) {
  // Keep an unsaved draft intact while unrelated workflow events arrive. Its
  // original version makes concurrent changes fail instead of being overwritten.
  const [draft, setDraft] = useState<{ fields: TaskFields; version: number; start: string; due: string; tags: string } | null>(null);
  const fields = draft?.fields || workflow.fields;
  const start = draft?.start ?? dateInput(fields.startDate, fields.isAllDay), due = draft?.due ?? dateInput(fields.dueDate, fields.isAllDay);
  const tags = draft?.tags ?? fields.tags.join(", ");
  const change = (patch: Partial<TaskFields>, inputs: Partial<{ start: string; due: string; tags: string }> = {}) => setDraft({ version: draft?.version ?? workflow.version, fields: { ...fields, ...patch }, start, due, tags, ...inputs });
  return <form className="coop-editor coop-workflow-settings" aria-label="详细设置" onSubmit={event => {
    event.preventDefault();
    if (!draft) return;
    const dates = {
      startDate: start === dateInput(fields.startDate, fields.isAllDay) ? fields.startDate : apiDate(start, fields.isAllDay),
      dueDate: due === dateInput(fields.dueDate, fields.isAllDay) ? fields.dueDate : apiDate(due, fields.isAllDay, true),
    };
    void perform({ id: crypto.randomUUID(), workflowId: workflow.id, version: draft.version, action: "update-workflow", fields: { title: fields.title, content: fields.content, priority: fields.priority, ...dates, isAllDay: fields.isAllDay, timeZone: fields.timeZone, repeatFlag: fields.repeatFlag, reminders: fields.reminders, tags: tags.split(/[,，]/).map(tag => tag.trim()).filter(Boolean) } }).then(done => { if (done) setDraft(null); });
  }}>
    <h4>详细设置</h4>
    {draft && draft.version !== workflow.version && <p className="coop-feedback" role="status">流程已更新。请先重新载入最新设置，再保存修改。</p>}
    <label>任务标题<input required maxLength={500} value={fields.title} disabled={disabled} onChange={event => change({ title: event.target.value })} /></label>
    <label>说明<textarea rows={3} maxLength={10000} value={fields.content} disabled={disabled} onChange={event => change({ content: event.target.value })} /></label>
    <label>优先级<select value={fields.priority} disabled={disabled} onChange={event => change({ priority: Number(event.target.value) as TaskFields["priority"] })}>{Object.entries({ 0: "无优先级", 1: "低", 3: "中", 5: "高" }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label className="coop-allday"><input type="checkbox" checked={fields.isAllDay} disabled={disabled} onChange={event => { const allDay = event.target.checked; change({ isAllDay: allDay, startDate: null, dueDate: null }, { start: start ? allDay ? start.slice(0, 10) : `${start.slice(0, 10)}T09:00` : "", due: due ? allDay ? due.slice(0, 10) : `${due.slice(0, 10)}T18:00` : "" }); }} />全天</label>
    <label>开始时间<input type={fields.isAllDay ? "date" : "datetime-local"} value={start} disabled={disabled} onChange={event => change({}, { start: event.target.value })} /></label>
    <label>截止时间<input type={fields.isAllDay ? "date" : "datetime-local"} value={due} disabled={disabled} onChange={event => change({}, { due: event.target.value })} /></label>
    <label>标签<input value={tags} placeholder="用逗号分隔" disabled={disabled} onChange={event => change({}, { tags: event.target.value })} /></label>
    <label>重复<select value={fields.repeatFlag} disabled={disabled} onChange={event => change({ repeatFlag: event.target.value })}><option value="">不重复</option>{["DAILY", "WEEKLY", "MONTHLY"].map((period, index) => <option key={period} value={`RRULE:FREQ=${period};INTERVAL=1`}>{["每天", "每周", "每月"][index]}</option>)}{fields.repeatFlag && !["DAILY", "WEEKLY", "MONTHLY"].some(period => fields.repeatFlag === `RRULE:FREQ=${period};INTERVAL=1`) && <option value={fields.repeatFlag}>保留现有重复规则</option>}</select></label>
    <label>提醒<select value={fields.reminders.length > 1 ? "custom" : fields.reminders[0] || ""} disabled={disabled} onChange={event => { if (event.target.value !== "custom") change({ reminders: event.target.value ? [event.target.value] : [] }); }}><option value="">不提醒</option><option value="TRIGGER:PT0S">到时间提醒</option><option value="TRIGGER:-PT15M">提前 15 分钟</option><option value="TRIGGER:-PT1H">提前 1 小时</option>{(fields.reminders.length > 1 || (fields.reminders[0] && !["TRIGGER:PT0S", "TRIGGER:-PT15M", "TRIGGER:-PT1H"].includes(fields.reminders[0]))) && <option value={fields.reminders.length > 1 ? "custom" : fields.reminders[0]}>保留现有提醒</option>}</select></label>
    <div className="coop-workflow-actions"><button type="button" disabled={disabled || !draft} onClick={() => setDraft(null)}>{draft && draft.version !== workflow.version ? "重新载入设置" : "取消修改"}</button><button type="submit" className="primary" disabled={disabled || !draft || !fields.title.trim() || draft.version !== workflow.version}>保存修改</button></div>
  </form>;
}
