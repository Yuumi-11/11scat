"use client";
import { useRef, useState } from "react";
import { Trash2, Loader2 } from "lucide-react";

export function CloudDeleteButton({ item, onDeleted, onError }: {
  item: { path: string; name: string; kind: "file" | "folder" };
  onDeleted: () => Promise<void>; onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function remove() {
    if (lock.current) return;
    if (!window.confirm(`删除${item.kind === "folder" ? "文件夹" : "文件"}“${item.name}”？\n${item.kind === "folder" ? "其中的全部文件也会删除。\n" : ""}这是共享云盘，删除后所有成员都将无法从云盘访问，且不可恢复。聊天原附件不受影响。`)) return;
    lock.current = true; setBusy(true); onError("");
    try {
      const response = await fetch("/api/cloud/files", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: item.path, confirmed: true }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "删除失败");
      await onDeleted();
    } catch (error) { onError(error instanceof Error ? error.message : "删除失败，请重试"); }
    finally { lock.current = false; setBusy(false); }
  }
  return <button type="button" className="cloud-delete-button" title={`删除${item.name}`} aria-label={`删除${item.name}`} disabled={busy} onClick={() => void remove()}>
    {busy ? <Loader2 size={14} aria-hidden="true" /> : <Trash2 size={14} aria-hidden="true" />}<span>{busy ? "删除中…" : "删除"}</span>
  </button>;
}
