"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BellRing, Send, X } from "lucide-react";
import type { TaskNotice } from "./collaboration-notifications";

export function TaskNudge({ notice, onRead, onClose }: { notice: TaskNotice; onRead: (ids: string[]) => Promise<void>; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), commandId = useRef(crypto.randomUUID());
  const [reply, setReply] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    const previous = document.activeElement, element = dialog.current;
    element?.showModal(); document.body.classList.add("task-nudge-shake");
    const timer = setTimeout(() => document.body.classList.remove("task-nudge-shake"), 650);
    return () => { clearTimeout(timer); document.body.classList.remove("task-nudge-shake"); element?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  const dismiss = async () => { setBusy(true); try { await onRead([notice.id]); onClose(); } catch { setError("浏览状态尚未保存，请重试"); } finally { setBusy(false); } };
  return createPortal(<dialog ref={dialog} className="task-nudge-dialog" aria-labelledby="task-nudge-title" onCancel={event => { event.preventDefault(); if (!busy) void dismiss(); }} onKeyDown={event => event.stopPropagation()}>
    <header><BellRing size={23} /><h3 id="task-nudge-title">同桌催办了这项任务</h3><button type="button" className="coop-icon" aria-label="稍后" disabled={busy} onClick={() => void dismiss()}><X size={20} /></button></header>
    <h4>{notice.title}</h4><p>{notice.body}</p>
    <form onSubmit={async event => {
      event.preventDefault(); if (busy || !reply.trim()) return; setBusy(true); setError("");
      try {
        const response = await fetch("/api/room/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: commandId.current, workflowId: notice.workflowId, version: 0, action: "reply-nudge", replyTo: notice.eventId, comment: reply }), signal: AbortSignal.timeout(20000) });
        const data = await response.json(); if (!response.ok) { if (response.status < 500) commandId.current = crypto.randomUUID(); throw new Error(data.error || "回复未发送，请重试"); }
        await onRead([notice.id]); onClose();
      } catch (cause) { setError(cause instanceof Error ? cause.message : "回复未发送，请重试"); }
      finally { setBusy(false); }
    }}><label htmlFor="task-nudge-reply">回复任务发起人</label><textarea id="task-nudge-reply" rows={3} maxLength={2000} value={reply} disabled={busy} onChange={event => { setReply(event.target.value); commandId.current = crypto.randomUUID(); }} placeholder="..." />
      {error && <p className="coop-feedback error" role="alert">{error}</p>}
      <footer><button type="button" disabled={busy} onClick={() => void dismiss()}>稍后</button><button type="submit" disabled={busy || !reply.trim()}><Send size={16} />发送</button></footer>
    </form>
  </dialog>, document.body);
}
