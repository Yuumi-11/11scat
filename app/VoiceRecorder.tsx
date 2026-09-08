"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2 } from "lucide-react";
import { VoiceRecording, type RecordingState } from "./voice-recording";

export function VoiceRecorder({ onRecorded, onError }: { onRecorded: (file: File) => void; onError: (message: string) => void }) {
  const callbacks = useRef({ onRecorded, onError });
  useEffect(() => { callbacks.current = { onRecorded, onError }; }, [onRecorded, onError]);
  const session = useRef<VoiceRecording | null>(null);
  const [state, setState] = useState<RecordingState>({ phase: "idle", seconds: 0 });
  useEffect(() => {
    const recording = new VoiceRecording({ state: setState, recorded: file => callbacks.current.onRecorded(file), error: message => callbacks.current.onError(message) });
    session.current = recording;
    return () => { recording.dispose(); session.current = null; };
  }, []);
  const active = state.phase === "recording" || state.phase === "finishing";
  return active ? <div className="voice-recording" role="group" aria-label="正在录音">
    <span role="status">{state.phase === "finishing" ? "正在结束录音…" : `录音 ${Math.floor(state.seconds / 60)}:${String(state.seconds % 60).padStart(2, "0")}`}</span>
    <button type="button" disabled={state.phase === "finishing"} onClick={() => session.current?.stop()} title="停止并发送" aria-label="停止并发送语音"><Square size={18} /></button>
    <button type="button" disabled={state.phase === "finishing"} onClick={() => session.current?.stop(true)} title="删除录音，不发送" aria-label="删除录音，不发送"><Trash2 size={18} /></button>
  </div> : <button className="chat-voice-button" type="button" onClick={() => void session.current?.start()} disabled={state.phase === "requesting"} title={state.phase === "requesting" ? "正在请求麦克风权限" : "录制语音"} aria-label="录制语音"><Mic size={20} aria-hidden="true" /></button>;
}
