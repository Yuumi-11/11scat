"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, X, LoaderCircle, Inbox } from "lucide-react";

type NewTask = { id: string; title: string; senderName: string; createdAt: number };

export function AddMemberTask({ recipientId, name }: { recipientId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const operation = useRef({ id: "", title: "" });
  const inFlight = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => { if (!inFlight.current) { setOpen(false); trigger.current?.focus(); } };
  const submit = async () => {
    const text = title.trim();
    if (!text || inFlight.current) return;
    if (operation.current.title !== text || !operation.current.id) operation.current = { title: text, id: crypto.randomUUID() };
    inFlight.current = true;
    setSending(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/ticktick/shared", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...operation.current, recipientId }), signal: AbortSignal.timeout(45_000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "添加失败，请重试。");
      setTitle(""); operation.current = { title: "", id: "" }; setOpen(false);
      setNotice(`已添加到${name}的收集箱`); trigger.current?.focus();
    } catch (error) { setError(error instanceof Error ? error.message : "添加结果未确认，请先查看对方收集箱。"); }
    finally { inFlight.current = false; setSending(false); }
  };
  return <div className="member-task-action">
    <button ref={trigger} type="button" className="icon-button member-task-add" title={`向${name}添加待办`} aria-label={`向${name}添加待办`} aria-expanded={open} aria-haspopup="dialog" onClick={() => { setOpen(!open); setNotice(""); }}><Plus size={20} /></button>
    {notice && <span className="member-task-notice" role="status">{notice}</span>}
    {open && <form className="member-task-popover" role="dialog" aria-label={`添加到${name}的收集箱`} onSubmit={event => { event.preventDefault(); void submit(); }} onKeyDown={event => { if (event.key === "Escape") close(); }}>
      <div className="popover-heading"><strong>给{name}的待办</strong><button type="button" className="icon-button" onClick={close} disabled={sending} aria-label="关闭添加待办" title="关闭"><X size={18} /></button></div>
      <input autoFocus value={title} onChange={event => setTitle(event.target.value)} maxLength={500} placeholder="填写待办，按 Enter 添加" aria-label="新待办内容" disabled={sending} onKeyDown={event => { if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault(); }} />
      <div className="popover-footer"><small>收集箱 · 无日期</small><button className="primary-button" type="submit" disabled={sending || !title.trim()}>{sending ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}{sending ? "正在添加" : "添加"}</button></div>
      {error && <p role="alert" className="error-message">{error}</p>}
    </form>}
  </div>;
}

export function NewMemberTasks({ identityId, onChanged }: { identityId: string; onChanged: () => Promise<boolean> }) {
  const [tasks, setTasks] = useState<NewTask[]>([]);
  const [shown, setShown] = useState<NewTask[] | null>(null);
  const [error, setError] = useState("");
  const [closing, setClosing] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closingRef = useRef(false);
  const seenIdsRef = useRef("");
  const loadVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    try {
      const response = await fetch("/api/ticktick/shared", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (!response.ok) return;
      const data = await response.json();
      if (version !== loadVersion.current || !Array.isArray(data.tasks)) return;
      setTasks(data.tasks);
      const ids = data.tasks.map((task: NewTask) => task.id).sort().join(",");
      if (ids !== seenIdsRef.current) { seenIdsRef.current = ids; void onChanged(); }
    } catch { /* Poll again on focus or the next interval. */ }
  }, [onChanged]);
  useEffect(() => {
    if (!identityId) return;
    const invalidatePendingLoad = () => { ++loadVersion.current; };
    const refresh = () => { if (document.visibilityState === "visible" && !closingRef.current) void load(); };
    const first = window.setTimeout(refresh, 0);
    const timer = window.setInterval(refresh, 5000);
    window.addEventListener("focus", refresh); window.addEventListener("online", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { invalidatePendingLoad(); clearTimeout(first); clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [identityId, load]);
  useEffect(() => {
    if (!shown) return;
    const dialog = dialogRef.current;
    const focus = document.activeElement;
    dialog?.showModal();
    return () => { dialog?.close(); if (focus instanceof HTMLElement && focus.isConnected) focus.focus({ preventScroll: true }); };
  }, [shown]);
  const close = async () => {
    if (!shown || closingRef.current) return;
    closingRef.current = true; setClosing(true); setError(""); ++loadVersion.current;
    try {
      const ids = shown.map(task => task.id);
      for (let offset = 0; offset < ids.length; offset += 1000) {
        const response = await fetch("/api/ticktick/shared", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: ids.slice(offset, offset + 1000) }), signal: AbortSignal.timeout(15_000) });
        if (!response.ok) throw new Error("未能保存已查看状态，请重试关闭。");
      }
      setTasks(current => current.filter(task => !ids.includes(task.id))); setShown(null);
      void load();
    } catch (error) { setError(error instanceof Error ? error.message : "未能保存已查看状态，请重试。"); }
    finally { closingRef.current = false; setClosing(false); }
  };
  return <>
    {tasks.length > 0 && <button className="member-task-new" type="button" title="查看他人添加的新待办" aria-label={`查看 ${tasks.length} 条新待办`} onClick={() => { setShown([...tasks]); setError(""); }}>新<span>{tasks.length}</span></button>}
    {shown && createPortal(<dialog className="new-tasks-dialog" ref={dialogRef} aria-labelledby="new-tasks-title" onCancel={event => { event.preventDefault(); void close(); }}>
      <div className="dialog-heading"><div><span className="eyebrow">收集箱</span><h2 id="new-tasks-title">收到的新待办</h2></div><button type="button" className="icon-button" title="关闭并标记已查看" aria-label="关闭新待办" disabled={closing} onClick={() => void close()}><X size={20} /></button></div>
      <p className="dialog-description">已添加到你的滴答收集箱，日期与清单可以在滴答中调整。</p>
      <ul className="new-tasks-list">{shown.map(task => <li key={task.id}><Inbox size={20} /><div><strong>{task.title}</strong><small>{task.senderName} · {new Date(task.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</small></div></li>)}</ul>
      {error && <p className="error-message" role="alert">{error}</p>}
      <button className="primary-button" type="button" disabled={closing} onClick={() => void close()}>{closing ? "正在保存…" : "已查看，关闭"}</button>
    </dialog>, document.body)}
  </>;
}
