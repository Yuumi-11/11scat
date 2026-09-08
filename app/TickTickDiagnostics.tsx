"use client";

import { useRef, useState } from "react";
import "./ticktick-diagnostics.css";

export function TickTickDiagnostics({ report }: { report?: string }) {
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(false);
  const inFlight = useRef(false), output = useRef<HTMLTextAreaElement>(null);
  const value = report || result;

  async function diagnose() {
    if (inFlight.current) return;
    setVisible(true); setError(""); setCopied(false);
    if (report) return;
    inFlight.current = true; setBusy(true);
    try {
      const response = await fetch("/api/ticktick/diagnostics", { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(20000) });
      if (response.redirected || !response.headers.get("content-type")?.includes("application/json")) throw new Error("当前登录会话不可用，请在此浏览器登录自习室后再试");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "诊断暂时无法读取");
      setResult(JSON.stringify(data, null, 2));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "诊断暂时无法读取"); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(value); setCopied(true); }
    catch { output.current?.focus(); output.current?.select(); setError("已选中诊断文字，请手动复制"); }
  }
  return <div className="ticktick-diagnostics">
    <button type="button" disabled={busy} onClick={() => void diagnose()}>{busy ? "正在诊断…" : "查看连接诊断"}</button>
    {visible && <div className="ticktick-diagnostic-result">
      <p>仅包含字段类型和数量，不包含令牌或任务正文。请复制以下结果用于排查。</p>
      {value && <><textarea ref={output} readOnly aria-label="脱敏连接诊断结果" value={value} rows={7} onFocus={event => event.target.select()} /><button type="button" onClick={() => void copy()}>{copied ? "已复制" : "复制诊断结果"}</button></>}
      {error && <p role="alert">{error}</p>}
    </div>}
  </div>;
}
