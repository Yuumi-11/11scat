"use client";

import { useRef, useState } from "react";
import { FileText, Loader2 } from "lucide-react";

export function VoiceTranscript({ src }: { src: string }) {
  const [text, setText] = useState<string | null>(null), [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const locked = useRef(false);
  async function toggle() {
    if (text !== null) { setOpen(value => !value); return; }
    if (locked.current) return;
    locked.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`${src.split("?")[0]}/transcript`, { method: "POST", signal: AbortSignal.timeout(180000) });
      const data = await response.json();
      if (!response.ok || typeof data.text !== "string") throw new Error(data.error || "转写暂时不可用");
      setText(data.text); setOpen(true);
    } catch (cause) { setError(cause instanceof Error && cause.name !== "TimeoutError" ? cause.message : "转写尚未返回，请稍后点按查看结果"); }
    finally { locked.current = false; setBusy(false); }
  }
  return <div className="voice-transcript">
    <button type="button" onClick={() => void toggle()} disabled={busy} aria-expanded={open} title="使用 Cloudflare 转写语音，结果保存供本室成员查看">
      {busy ? <Loader2 size={14} aria-hidden="true" className="voice-transcript-spinner" /> : <FileText size={14} aria-hidden="true" />}
      {busy ? "转写中…" : text !== null ? open ? "收起文字" : "查看文字" : "转文字"}
    </button>
    {error && <p role="alert">{error}</p>}
    {open && <div className="voice-transcript-text">{text || "未识别到语音内容"}</div>}
  </div>;
}
