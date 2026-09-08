"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, CalendarOff, Check, Ellipsis, GripVertical, Inbox, Loader2, Plus, RefreshCw, Trash2, UsersRound, X } from "lucide-react";
import type { CollaborationCommand, CollaborationSnapshot, OperationView, RoomTask, TaskFields } from "./collaboration-types";
import "./room-collaboration.css";
import { TickTickDiagnostics } from "./TickTickDiagnostics";
import { InlineTaskTitle } from "./InlineTaskTitle";
import { collaborationDate, splitCollaborationTasks } from "./collaboration-view";

type RequestCommand = CollaborationCommand | { id: string; action: "resume" | "cancel" };
type Editor = { task: RoomTask; title: string; content: string; priority: TaskFields["priority"]; start: string; due: string; allDay: boolean; tags: string; repeat: string; reminders: string[] };
const taskKey = (task: RoomTask) => `${task.ownerId || "buffer"}:${task.id}`;
const taskSource = (task: RoomTask) => ({ ownerId: task.ownerId, taskId: task.id, version: task.version });
const dateInput = (date: string | null, allDay: boolean) => date ? new Date(Date.parse(date) + 8 * 3600000).toISOString().slice(0, allDay ? 10 : 16) : "";
const apiDate = (text: string, allDay: boolean, end = false) => text ? `${text}${allDay ? end ? "T23:59:00" : "T00:00:00" : ":00"}+0800` : null;
const dateLabel = (task: RoomTask) => collaborationDate(task) ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "numeric", day: "numeric", ...(task.isAllDay ? {} : { hour: "2-digit", minute: "2-digit" }) }).format(new Date(collaborationDate(task)!)) : "";
const priorities = { 0: "无优先级", 1: "低", 3: "中", 5: "高" };

export function RoomCollaboration({ identityId, onChanged }: { identityId: string; onChanged: () => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<CollaborationSnapshot | null>(null);
  const [bufferCount, setBufferCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [inlineTask, setInlineTask] = useState<RoomTask | null>(null);
  const [keyboardDrag, setKeyboardDrag] = useState<{ task: RoomTask; owner: string } | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [uncertain, setUncertain] = useState<RequestCommand | null>(null);
  const [hoverOwner, setHoverOwner] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; title: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null), membersPane = useRef<HTMLDivElement>(null);
  const locked = useRef(false), fetching = useRef(false), revision = useRef<number | null>(null), generation = useRef(0);
  const loadController = useRef<AbortController | null>(null);
  const drag = useRef<{ task: RoomTask; x: number; y: number; moved: boolean } | null>(null);

  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 2400); return () => clearTimeout(timer); }, [notice]);

  const load = useCallback(async (force = false) => {
    if (fetching.current && !force) return null;
    if (force) loadController.current?.abort();
    const controller = new AbortController(); loadController.current = controller;
    fetching.current = true; setLoading(true);
    const id = ++generation.current;
    try {
      const response = await fetch("/api/room/tasks", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "协作区读取失败");
      if (id !== generation.current) return null;
      setSnapshot(data); setBufferCount(data.buffer.length); revision.current = data.revision;
      return data as CollaborationSnapshot;
    } catch (cause) { if (id === generation.current) setError(cause instanceof Error ? cause.message : "协作区暂时无法读取"); return null; }
    finally { if (id === generation.current) { fetching.current = false; setLoading(false); } }
  }, []);

  useEffect(() => {
    if (!identityId) return;
    let stopped = false, polling = false;
    const poll = async () => {
      if (stopped || polling || document.hidden || locked.current) return;
      polling = true;
      try {
        const response = await fetch("/api/room/tasks?revision=1", { cache: "no-store", signal: AbortSignal.timeout(8000) });
        if (!response.ok) return;
        const data = await response.json();
        if (stopped) return;
        setBufferCount(data.bufferCount);
        if (revision.current !== null && revision.current !== data.revision) { void onChanged(); if (open) void load(); }
        revision.current = data.revision;
      } catch { /* Try again on the next poll or focus. */ }
      finally { polling = false; }
    };
    const first = setTimeout(() => void poll(), 0), timer = setInterval(() => void poll(), 5000);
    const focus = () => void poll();
    window.addEventListener("focus", focus); window.addEventListener("online", focus);
    return () => { stopped = true; clearTimeout(first); clearInterval(timer); window.removeEventListener("focus", focus); window.removeEventListener("online", focus); };
  }, [identityId, open, onChanged, load]);
  useEffect(() => {
    if (!open) return;
    const element = dialog.current, button = trigger.current;
    element?.showModal();
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => { if (!document.hidden && !locked.current && !drag.current) void load(); }, 15000);
    const invalidate = () => { generation.current++; fetching.current = false; loadController.current?.abort(); };
    return () => { clearTimeout(first); clearInterval(timer); invalidate(); element?.close(); button?.focus({ preventScroll: true }); };
  }, [open, load]);

  async function perform(command: RequestCommand): Promise<boolean> {
    if (locked.current) return false;
    locked.current = true; setBusy(true); setError(""); setNotice(""); setUncertain(command);
    let operation: OperationView | undefined;
    try {
      const response = await fetch("/api/room/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command), signal: AbortSignal.timeout(90000) });
      const data = await response.json();
      if (!response.ok) { if (response.status < 500) setUncertain(null); throw new Error(data.error || "操作未完成"); }
      operation = data.operation;
      setUncertain(null);
      if (operation?.status === "pending") setError(operation.error || "操作尚未完成，请在下方继续处理");
      else setNotice(operation?.status === "cancelled" ? "已取消未完成的操作" : "已保存");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "请求结果未确认，请核对并重试"); }
    finally {
      const next = await load(true);
      const known = next?.operations.find(item => item.id === command.id);
      if (known) { setUncertain(null); operation ||= known; }
      if (operation?.status === "done") { setError(""); setNotice("已保存"); }
      locked.current = false; setBusy(false);
      void onChanged();
    }
    if (operation?.status === "done" || operation?.status === "cancelled") setDraftId(current => current === command.id ? null : current);
    return operation?.status === "done";
  }
  const unavailable = busy || !!uncertain;
  const ownerName = (owner: string | null) => owner === null ? "任务板" : snapshot?.members.find(member => member.id === owner)?.name || "成员";
  const canDrop = (owner: string) => owner === "" || snapshot?.members.some(member => member.id === owner && member.connected && !member.error);
  const move = async (task: RoomTask, owner: string) => {
    if (unavailable || task.pending || task.transferBlocked || (task.ownerId || "") === owner || !canDrop(owner)) return;
    await perform({ id: crypto.randomUUID(), action: "move", source: taskSource(task), destination: owner || null });
  };
  const close = () => { if (!locked.current) { setOpen(false); setEditor(null); setInlineTask(null); setDraftId(null); setKeyboardDrag(null); setHoverOwner(null); setGhost(null); drag.current = null; } };
  const edit = (task: RoomTask) => {
    setDeleteArmed(false); setError(""); setKeyboardDrag(null); setHoverOwner(null);
    setEditor({ task, title: task.title, content: task.content, priority: task.priority, start: dateInput(task.startDate, task.isAllDay), due: dateInput(task.dueDate, task.isAllDay), allDay: task.isAllDay, tags: task.tags.join(", "), repeat: task.repeatFlag, reminders: task.reminders });
  };
  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current) return;
    if (!current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 7) return;
    current.moved = true;
    setGhost({ x: event.clientX + 14, y: event.clientY + 12, title: current.task.title });
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const target = hit?.closest<HTMLElement>("[data-coop-owner]");
    setHoverOwner(target && canDrop(target.dataset.coopOwner!) ? target.dataset.coopOwner! : null);
    const bounds = membersPane.current?.getBoundingClientRect();
    if (bounds && event.clientY >= bounds.top && event.clientY <= bounds.bottom) {
      if (event.clientX > bounds.right - 55) membersPane.current?.scrollBy({ left: 22 });
      else if (event.clientX < bounds.left + 55) membersPane.current?.scrollBy({ left: -22 });
      if (event.clientY > bounds.bottom - 35) membersPane.current?.scrollBy({ top: 18 });
      else if (event.clientY < bounds.top + 35) membersPane.current?.scrollBy({ top: -18 });
    }
    const list = hit?.closest<HTMLElement>(".coop-task-list");
    const rect = list?.getBoundingClientRect();
    if (rect) { if (event.clientY > rect.bottom - 45) list?.scrollBy({ top: 18 }); else if (event.clientY < rect.top + 45) list?.scrollBy({ top: -18 }); }
  }
  function finishDrag(event: PointerEvent<HTMLButtonElement>, cancel = false) {
    const current = drag.current; drag.current = null; setGhost(null); setHoverOwner(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!cancel && current?.moved) {
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-coop-owner]");
      if (target) void move(current.task, target.dataset.coopOwner!);
    }
  }
  function card(task: RoomTask) {
    const pending = !!task.pending, isEditing = inlineTask && taskKey(inlineTask) === taskKey(task);
    const cardLocked = unavailable || pending || !!inlineTask || !!draftId;
    return <article className={`coop-task priority-${task.priority}${pending ? " pending" : ""}`} key={taskKey(task)}>
      <div className="coop-task-top"><button className="coop-drag" type="button" title={task.transferBlocked || "拖动安排任务；键盘可按空格、方向键，再按 Enter 放下"} aria-label={`拖动任务 ${task.title}`} aria-pressed={keyboardDrag?.task.id === task.id && keyboardDrag.task.ownerId === task.ownerId} disabled={cardLocked || !!task.transferBlocked}
        onBlur={() => { setKeyboardDrag(null); setHoverOwner(null); }}
        onKeyDown={event => {
          if (![" ", "Enter", "Escape", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
          if (!keyboardDrag && ![" ", "Enter"].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation();
          if (event.key === "Escape") { setKeyboardDrag(null); setHoverOwner(null); return; }
          if (!keyboardDrag) { setKeyboardDrag({ task, owner: task.ownerId || "" }); setHoverOwner(task.ownerId || ""); return; }
          if ([" ", "Enter"].includes(event.key)) { void move(keyboardDrag.task, keyboardDrag.owner); setKeyboardDrag(null); setHoverOwner(null); return; }
          const owners = ["", ...(snapshot?.members.filter(member => canDrop(member.id)).map(member => member.id) || [])];
          const next = owners[(owners.indexOf(keyboardDrag.owner) + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1) + owners.length) % owners.length];
          setKeyboardDrag({ task: keyboardDrag.task, owner: next }); setHoverOwner(next);
          const target = Array.from(dialog.current?.querySelectorAll<HTMLElement>("[data-coop-owner]") || []).find(element => element.dataset.coopOwner === next);
          target?.scrollIntoView({ block: "nearest", inline: "nearest" });
        }}
        onPointerDown={event => { if (event.button !== 0) return; setKeyboardDrag(null); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { task, x: event.clientX, y: event.clientY, moved: false }; }} onPointerMove={pointerMove} onPointerUp={event => finishDrag(event)} onPointerCancel={event => finishDrag(event, true)} onLostPointerCapture={() => { drag.current = null; setGhost(null); setHoverOwner(null); }}><GripVertical size={18} aria-hidden="true" /></button>
        {isEditing ? <InlineTaskTitle key={taskKey(inlineTask)} initialValue={inlineTask.title} label="修改任务标题" disabled={unavailable} onCancel={() => setInlineTask(null)} onSave={async title => {
          const done = title === inlineTask.title || await perform({ id: crypto.randomUUID(), action: "update", source: taskSource(inlineTask), fields: { title } });
          if (done) setInlineTask(null); return done;
        }} /> : <button className="coop-task-title" type="button" disabled={cardLocked} title="点击修改标题" onClick={() => { setInlineTask(task); setError(""); }}>{task.title}</button>}
        <button className="coop-more" type="button" title="任务详情" aria-label={`任务详情 ${task.title}`} disabled={cardLocked} onClick={() => edit(task)}><Ellipsis size={18} aria-hidden="true" /></button>
        <button className="coop-complete" type="button" title="标记完成" aria-label={`完成任务 ${task.title}`} disabled={cardLocked} onClick={() => void perform({ id: crypto.randomUUID(), action: "complete", source: taskSource(task) })}><Check size={15} aria-hidden="true" /></button></div>
      {task.content && <p className="coop-task-summary">{task.content}</p>}
      {(collaborationDate(task) || task.priority !== 0 || task.repeatFlag || (task.ownerId !== identityId && canDrop(identityId))) && <div className="coop-task-meta">{collaborationDate(task) && <span title={task.dueDate === collaborationDate(task) ? "截止时间" : "开始时间"}>{dateLabel(task)}</span>}{task.priority !== 0 && <span className="coop-priority">{priorities[task.priority]}优先级</span>}{task.repeatFlag && <span>重复</span>}
        {task.ownerId !== identityId && canDrop(identityId) && <button className="coop-claim" type="button" disabled={cardLocked || !!task.transferBlocked} onClick={() => void move(task, identityId)}>认领</button>}
      </div>}
      {task.transferBlocked && <small className="coop-transfer-note">{task.transferBlocked}</small>}
      {pending && <small className="coop-pending-label">处理中…</small>}
    </article>;
  }
  function column(owner: string | null, name: string, tasks: RoomTask[], problem?: string, diagnostic?: string) {
    const { dated, undated } = splitCollaborationTasks(tasks);
    return <section key={owner || "buffer"} data-coop-owner={owner || ""} className={`coop-column${owner === null ? " buffer" : ""}${hoverOwner === (owner || "") ? " drop-active" : ""}`}>
      <header><span className="coop-column-icon">{owner === null ? <Inbox size={18} /> : name.slice(0, 1)}</span><h3>{name}{owner === identityId && <small>我</small>}</h3><span className="coop-count">{tasks.length}</span>{owner === null && <button type="button" className="coop-icon coop-refresh" disabled={loading || busy} title="刷新全室任务" aria-label="刷新全室任务" onClick={() => { setError(""); void load(); void onChanged(); }}><RefreshCw size={17} className={loading ? "coop-spin" : ""} /></button>}</header>
      {problem ? <div className="coop-task-list"><p className="coop-empty">{problem}</p>{(diagnostic || owner === identityId) && <TickTickDiagnostics report={diagnostic} />}</div> : owner !== null ? <div className="coop-member-lanes">{([{ label: "有日期", icon: CalendarDays, tasks: dated }, { label: "无日期", icon: CalendarOff, tasks: undated }]).map(lane => <section className="coop-lane" key={lane.label} aria-label={`${name}的${lane.label}待办`}><header><lane.icon size={13} aria-hidden="true" /><h4>{lane.label}</h4><span>{lane.tasks.length}</span></header><div className="coop-task-list">{lane.tasks.map(card)}</div></section>)}</div> : <div className="coop-task-list">{tasks.map(card)}{draftId ? <div className="coop-new-task editing"><Plus size={18} aria-hidden="true" /><InlineTaskTitle key={draftId} initialValue="" label="新任务标题" disabled={unavailable || !!snapshot?.operations.some(operation => operation.id === draftId && operation.status === "pending")} onCancel={() => setDraftId(null)} onSave={async title => {
        const done = await perform({ id: draftId, action: "create", fields: { title } }); if (done) setDraftId(null); return done;
      }} /></div> : <button className="coop-new-task" type="button" title="新建任务" aria-label="新建任务" disabled={unavailable || !!inlineTask} onClick={() => { setDraftId(crypto.randomUUID()); setError(""); }}><Plus size={25} aria-hidden="true" /></button>}</div>}
    </section>;
  }
  const pending = snapshot?.operations.filter(operation => operation.status === "pending") || [];
  return <>
    <button ref={trigger} className="room-collaboration-trigger" type="button" disabled={!identityId} title="打开自习室协作区" aria-haspopup="dialog" aria-expanded={open} onClick={() => { setOpen(true); setError(""); }}><UsersRound size={18} aria-hidden="true" /><span>协作区</span>{bufferCount > 0 && <i>{bufferCount}</i>}</button>
    {open && createPortal(<dialog ref={dialog} tabIndex={-1} className="room-collaboration-dialog" aria-label="自习室任务协作" onCancel={event => { event.preventDefault(); if (editor) { if (!locked.current) setEditor(null); } else close(); }} onKeyDown={event => {
      event.stopPropagation();
      if (editor && event.key === "Tab") {
        const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('.coop-editor button:not(:disabled), .coop-editor input:not(:disabled), .coop-editor textarea:not(:disabled), .coop-editor select:not(:disabled)') || []);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <button type="button" className="coop-icon coop-close" disabled={busy || !!editor} title="关闭" aria-label="关闭协作区" onClick={close}><X size={21} /></button>
      <div className="coop-surface">
      {(error || notice || busy) && <p className={`coop-feedback${error ? " error" : ""}`} role="status">{busy && <Loader2 className="coop-spin" size={14} />}{error || (busy ? "正在保存…" : notice)}</p>}
      {uncertain && !busy && <div className="coop-recovery">上次提交结果未确认。<button type="button" onClick={() => void perform(uncertain)}>核对并重试</button></div>}
      {pending.length > 0 && <div className="coop-recovery-list">{pending.map(operation => <div className="coop-recovery" key={operation.id}><span><strong>{operation.title}</strong><small>{operation.action === "move" ? `${ownerName(operation.from)} → ${ownerName(operation.to)}` : `${ownerName(operation.from)} · ${{ create: "添加", update: "修改", complete: "完成", delete: "删除" }[operation.action]}`} · {operation.error || "等待继续"}</small></span><button type="button" disabled={unavailable} onClick={() => void perform({ id: operation.id, action: "resume" })}>继续</button><button type="button" disabled={unavailable} onClick={() => void perform({ id: operation.id, action: "cancel" })}>{operation.action === "move" ? "取消转移" : "停止重试"}</button></div>)}</div>}
      <div className="coop-layout" aria-busy={loading || busy}>{snapshot ? <>{column(null, "任务板", snapshot.buffer)}<div ref={membersPane} className="coop-members">{snapshot.members.map(member => column(member.id, member.name, member.tasks, member.error, member.diagnostic))}</div></> : <p className="coop-empty">{loading ? "正在读取…" : "暂时无法读取，请点击刷新"}</p>}</div>
      <span className="coop-sr-only" aria-live="polite">{keyboardDrag ? `正在移动 ${keyboardDrag.task.title}，目标 ${ownerName(keyboardDrag.owner || null)}，方向键选择，Enter 放下，Esc 取消` : ""}</span>
      {editor && <div className="coop-editor-backdrop"><form className="coop-editor" aria-label="编辑协作任务" onSubmit={event => {
        event.preventDefault();
        void perform({ id: crypto.randomUUID(), action: "update", source: taskSource(editor.task), fields: { title: editor.title, content: editor.content, priority: editor.priority,
          startDate: editor.allDay === editor.task.isAllDay && editor.start === dateInput(editor.task.startDate, editor.task.isAllDay) ? editor.task.startDate : apiDate(editor.start, editor.allDay),
          dueDate: editor.allDay === editor.task.isAllDay && editor.due === dateInput(editor.task.dueDate, editor.task.isAllDay) ? editor.task.dueDate : apiDate(editor.due, editor.allDay, true),
          isAllDay: editor.allDay, timeZone: editor.task.timeZone, tags: editor.tags.split(/[,，]/).map(tag => tag.trim()).filter(Boolean), repeatFlag: editor.repeat, reminders: editor.reminders } }).then(done => { if (done) setEditor(null); });
      }}><div className="coop-editor-heading"><h3>编辑任务 · {ownerName(editor.task.ownerId)}</h3><button className="coop-icon" type="button" disabled={busy} aria-label="关闭任务编辑" onClick={() => setEditor(null)}><X size={19} /></button></div>
        <label>任务标题<input autoFocus required maxLength={500} value={editor.title} disabled={unavailable} onChange={event => setEditor({ ...editor, title: event.target.value })} /></label>
        <label>说明<textarea rows={3} maxLength={10000} value={editor.content} disabled={unavailable} onChange={event => setEditor({ ...editor, content: event.target.value })} /></label>
        <div className="coop-editor-row"><label>优先级<select value={editor.priority} disabled={unavailable} onChange={event => setEditor({ ...editor, priority: Number(event.target.value) as TaskFields["priority"] })}>{Object.entries(priorities).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="coop-allday"><input type="checkbox" checked={editor.allDay} disabled={unavailable} onChange={event => { const allDay = event.target.checked; setEditor({ ...editor, allDay, start: editor.start ? allDay ? editor.start.slice(0, 10) : `${editor.start.slice(0, 10)}T09:00` : "", due: editor.due ? allDay ? editor.due.slice(0, 10) : `${editor.due.slice(0, 10)}T18:00` : "" }); }} />全天</label></div>
        <div className="coop-editor-row"><label>开始时间<input type={editor.allDay ? "date" : "datetime-local"} value={editor.start} disabled={unavailable} onChange={event => setEditor({ ...editor, start: event.target.value })} /></label><label>截止时间<input type={editor.allDay ? "date" : "datetime-local"} value={editor.due} disabled={unavailable} onChange={event => setEditor({ ...editor, due: event.target.value })} /></label></div>
        <label>标签<input value={editor.tags} placeholder="用逗号分隔" disabled={unavailable} onChange={event => setEditor({ ...editor, tags: event.target.value })} /></label>
        <div className="coop-editor-row"><label>重复<select value={editor.repeat} disabled={unavailable} onChange={event => setEditor({ ...editor, repeat: event.target.value })}><option value="">不重复</option><option value="RRULE:FREQ=DAILY;INTERVAL=1">每天</option><option value="RRULE:FREQ=WEEKLY;INTERVAL=1">每周</option><option value="RRULE:FREQ=MONTHLY;INTERVAL=1">每月</option>{editor.repeat && !["RRULE:FREQ=DAILY;INTERVAL=1", "RRULE:FREQ=WEEKLY;INTERVAL=1", "RRULE:FREQ=MONTHLY;INTERVAL=1"].includes(editor.repeat) && <option value={editor.repeat}>保留现有重复规则</option>}</select></label><label>提醒<select value={editor.reminders.length > 1 ? "custom" : editor.reminders[0] || ""} disabled={unavailable} onChange={event => { if (event.target.value !== "custom") setEditor({ ...editor, reminders: event.target.value ? [event.target.value] : [] }); }}><option value="">不提醒</option><option value="TRIGGER:PT0S">到时间提醒</option><option value="TRIGGER:-PT15M">提前 15 分钟</option><option value="TRIGGER:-PT1H">提前 1 小时</option>{(editor.reminders.length > 1 || (editor.reminders[0] && !["TRIGGER:PT0S", "TRIGGER:-PT15M", "TRIGGER:-PT1H"].includes(editor.reminders[0]))) && <option value={editor.reminders.length > 1 ? "custom" : editor.reminders[0]}>保留现有提醒</option>}</select></label></div>
        {error && <p className="coop-feedback error" role="alert">{error}</p>}
        <div className="coop-editor-buttons"><button type="button" className="coop-delete" disabled={unavailable} onClick={() => { if (!deleteArmed) setDeleteArmed(true); else void perform({ id: crypto.randomUUID(), action: "delete", source: taskSource(editor.task) }).then(done => { if (done) setEditor(null); }); }}><Trash2 size={16} />{deleteArmed ? "确认删除此任务" : "删除"}</button><button type="submit" className="coop-save" disabled={unavailable || !editor.title.trim()}>保存修改</button></div>
      </form></div>}
      {ghost && <div className="coop-drag-ghost" style={{ left: Math.min(ghost.x, window.innerWidth - 220), top: Math.min(ghost.y, window.innerHeight - 70) }}><GripVertical size={17} />{ghost.title}</div>}
      </div>
    </dialog>, document.body)}
  </>;
}
