"use client";

import { useRef, useState } from "react";
import { TaskDescriptionEditor } from "./TaskDescription";
import { WorkflowTaskDeletion } from "./WorkflowTaskDeletion";
import { CalendarDays, X } from "lucide-react";
import { rebaseWorkflowDraft } from './workflow-draft';
import type { ClaimWorkflow, TaskFields, WorkflowCommand } from "./collaboration-types";

const dateInput = (date: string | null, allDay: boolean) => date ? new Date(Date.parse(date) + 8 * 3600000).toISOString().slice(0, allDay ? 10 : 16) : "";
const apiDate = (text: string, allDay: boolean, end = false) => text ? `${text}${allDay ? end ? "T23:59:00" : "T00:00:00" : ":00"}+0800` : null;

function CalendarField({ label, value, allDay, disabled, change }: { label: string; value: string; allDay: boolean; disabled: boolean; change: (value: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return <div className="workflow-calendar"><span>{label}</span><div>
    <button type="button" disabled={disabled} aria-label={`选择${label}`}  onClick={() => { const element = input.current; if (element?.showPicker) element.showPicker(); else element?.click(); }}><CalendarDays size={15} /><span>{value ? value.replace("T", " ") : "选择日期"}</span></button>
    <input ref={input} tabIndex={-1} aria-label={label} type={allDay ? "date" : "datetime-local"} value={value} disabled={disabled} onKeyDown={event => { if (event.key !== "Tab" && event.key !== "Escape") event.preventDefault(); }} onChange={event => change(event.target.value)} />
    {value && <button className="workflow-date-clear" type="button" aria-label={`清除${label}`} disabled={disabled} onClick={() => change("")}><X size={12} /></button>}
  </div></div>;
}

function Choices({ label, value, options, disabled, change }: { label: string; value: string; options: [string, string][]; disabled: boolean; change: (value: string) => void }) {
  return <fieldset className="workflow-choices" disabled={disabled}><legend>{label}</legend><div>{options.map(([id, name]) => <button key={id} type="button" aria-pressed={value === id} onClick={() => change(id)}>{name}</button>)}</div></fieldset>;
}

export function WorkflowSettings({ workflow, identityId, disabled, perform }: { workflow: ClaimWorkflow; identityId: string; disabled: boolean; perform: (command: WorkflowCommand) => Promise<boolean> }) {
  disabled ||= workflow.status === 'deleted' || !!workflow.ownerDeletePending;
  const [uploading, setUploading] = useState(false);
  const [draft, setDraft] = useState<{ fields: TaskFields; base: TaskFields; start: string; due: string; tags: string } | null>(null);
  const fields = draft?.fields || workflow.fields;
  const start = draft?.start ?? dateInput(fields.startDate, fields.isAllDay), due = draft?.due ?? dateInput(fields.dueDate, fields.isAllDay);
  const tags = draft?.tags ?? fields.tags.join(", ");
  const change = (patch: Partial<TaskFields>, inputs: Partial<{ start: string; due: string; tags: string }> = {}) => setDraft({ base: draft?.base ?? workflow.fields, fields: { ...fields, ...patch }, start, due, tags, ...inputs });
  const editedFields = { ...fields,
    startDate: start === dateInput(fields.startDate, fields.isAllDay) ? fields.startDate : apiDate(start, fields.isAllDay),
    dueDate: due === dateInput(fields.dueDate, fields.isAllDay) ? fields.dueDate : apiDate(due, fields.isAllDay, true),
    tags: tags.split(/[,，]/).map(tag => tag.trim()).filter(Boolean),
  };
  const rebased = rebaseWorkflowDraft(draft?.base || workflow.fields, editedFields, workflow.fields);
  return <form className="coop-editor coop-workflow-settings" aria-label="详细设置" onSubmit={event => {
    event.preventDefault();
    if (!draft || disabled || uploading || rebased.conflicts.length) return;
    void perform({ id: crypto.randomUUID(), workflowId: workflow.id, version: workflow.version, action: "update-workflow", fields: rebased.patch }).then(done => { if (done) setDraft(null); });
  }}>
    <h4>详细设置</h4>
    {draft && rebased.conflicts.length > 0 && <div className="coop-feedback" role="status"><p>其他成员修改了你正在编辑的内容，你的输入已保留。</p><button type="button" disabled={disabled} onClick={() => setDraft(null)}>采用最新内容</button><button type="button" disabled={disabled} onClick={() => { const merged = { ...workflow.fields, ...rebased.patch }; setDraft({ fields: merged, base: workflow.fields, start: dateInput(merged.startDate, merged.isAllDay), due: dateInput(merged.dueDate, merged.isAllDay), tags: merged.tags.join(', ') }); }}>保留我的修改</button></div>}
    <label>任务标题<input required maxLength={500} value={fields.title} disabled={disabled} onChange={event => change({ title: event.target.value })} /></label>
    <TaskDescriptionEditor value={fields.content} disabled={disabled} taskKey={workflow.id} onChange={content => change({ content })} onUploading={setUploading} />
    <Choices label="优先级" value={String(fields.priority)} options={[["1", "低"], ["3", "中"], ["5", "高"]]} disabled={disabled} change={value => change({ priority: fields.priority === Number(value) ? 0 : Number(value) as TaskFields["priority"] })} />
    <div className="workflow-dates">
    <CalendarField label="开始时间" value={start} allDay={fields.isAllDay} disabled={disabled} change={value => change({}, { start: value })} />
    <CalendarField label="结束时间" value={due} allDay={fields.isAllDay} disabled={disabled} change={value => change({}, { due: value })} />
    <label className="coop-allday"><input type="checkbox" checked={fields.isAllDay} disabled={disabled} onChange={event => { const allDay = event.target.checked; change({ isAllDay: allDay, startDate: null, dueDate: null }, { start: start ? allDay ? start.slice(0, 10) : `${start.slice(0, 10)}T09:00` : "", due: due ? allDay ? due.slice(0, 10) : `${due.slice(0, 10)}T18:00` : "" }); }} />全天</label>
    </div>
    <Choices label="重复" value={fields.repeatFlag} options={[["", "不重复"], ...["DAILY", "WEEKLY", "MONTHLY"].map((period, index): [string, string] => [`RRULE:FREQ=${period};INTERVAL=1`, ["每天", "每周", "每月"][index]]), ...(fields.repeatFlag && !["DAILY", "WEEKLY", "MONTHLY"].some(period => fields.repeatFlag === `RRULE:FREQ=${period};INTERVAL=1`) ? [[fields.repeatFlag, "现有规则"] as [string, string]] : [])]} disabled={disabled} change={value => change({ repeatFlag: value })} />
    <Choices label="提醒" value={fields.reminders.length > 1 ? "custom" : fields.reminders[0] || ""} options={[["", "不提醒"], ["TRIGGER:PT0S", "准时"], ["TRIGGER:-PT15M", "提前15分"], ["TRIGGER:-PT1H", "提前1时"], ...((fields.reminders.length > 1 || (fields.reminders[0] && !["TRIGGER:PT0S", "TRIGGER:-PT15M", "TRIGGER:-PT1H"].includes(fields.reminders[0]))) ? [[fields.reminders.length > 1 ? "custom" : fields.reminders[0], "现有提醒"] as [string, string]] : [])]} disabled={disabled} change={value => { if (value !== "custom") change({ reminders: value ? [value] : [] }); }} />
    <label>标签<input value={tags} placeholder="用逗号分隔" disabled={disabled} onChange={event => change({}, { tags: event.target.value })} /></label>
    <div className="workflow-settings-footer"><WorkflowTaskDeletion workflow={workflow} identityId={identityId} disabled={disabled || uploading} perform={perform} /><div className="coop-workflow-actions"><button type="submit" className="primary" disabled={disabled || uploading || !draft || !fields.title.trim() || !!rebased.conflicts.length}>保存修改</button></div></div>
  </form>;
}
