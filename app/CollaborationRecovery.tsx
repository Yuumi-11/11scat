"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

export function CollaborationRecovery({ busy, onClose, children }: { busy: boolean; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current, previous = document.activeElement;
    element?.showModal();
    return () => { element?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} className="coop-recovery-dialog" aria-label="待处理的协作操作" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onKeyDown={event => event.stopPropagation()}>
    <header><h3>待处理</h3><button type="button" className="coop-icon" disabled={busy} aria-label="关闭待处理面板" onClick={onClose}><X size={18} /></button></header>
    <div className="coop-recovery-content">{children}</div>
  </dialog>;
}

export function TransferCheck({ operationId, disabled, onRecover }: { operationId: string; disabled?: boolean; onRecover?: (target: { id: string; version: string }) => void }) {
  const [loading, setLoading] = useState(false), [result, setResult] = useState("");
  const [candidates, setCandidates] = useState<{ id: string; version: string }[]>([]);
  async function check() {
    setLoading(true); setResult(""); setCandidates([]);
    try {
      const response = await fetch(`/api/room/tasks?diagnose=${encodeURIComponent(operationId)}`, { cache: "no-store", signal: AbortSignal.timeout(60000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "暂时无法核对，请稍后重试");
      setResult(data.message);
      setCandidates(data.sourceUnchanged ? data.candidates || [] : []);
    } catch (error) { setResult(error instanceof Error ? error.message : "暂时无法核对"); }
    finally { setLoading(false); }
  }
  return <div className="coop-transfer-check"><button type="button" disabled={loading || disabled} onClick={() => void check()}>{loading ? "正在核对…" : "查看核对结果"}</button>{result && <p role="status">{result}</p>}{onRecover && candidates.map((target, index) => <button key={target.id} type="button" disabled={disabled || loading} onClick={() => onRecover(target)}>接续已有副本{candidates.length > 1 ? ` ${index + 1}` : ""}</button>)}</div>;
}
