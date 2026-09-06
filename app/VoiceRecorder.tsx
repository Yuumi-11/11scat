"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, X } from "lucide-react";

export function VoiceRecorder({ onRecorded, onError }: { onRecorded: (file: File) => void; onError: (message: string) => void }) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const discardRef = useRef(false);
  const mountedRef = useRef(true);
  const [recording, setRecording] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      discardRef.current = true;
      if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const stop = (discard = false) => {
    discardRef.current = discard;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const start = async () => {
    if (requesting || recording) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onError("当前浏览器不支持录音，请使用 HTTPS 下的新版浏览器。");
      return;
    }
    setRequesting(true);
    onError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      discardRef.current = false;
      const chunks: Blob[] = [];
      let bytes = 0;
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        chunks.push(event.data);
        bytes += event.data.size;
        if (bytes >= 25 * 1024 * 1024 && recorder.state === "recording") recorder.stop();
      };
      recorder.onerror = () => { discardRef.current = true; onError("录音中断，请重新录制。"); if (recorder.state !== "inactive") recorder.stop(); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (timerRef.current) clearInterval(timerRef.current);
        if (!mountedRef.current) return;
        setRecording(false);
        if (discardRef.current) return;
        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunks, { type });
        if (!blob.size) { onError("没有录到声音，请重新录制。"); return; }
        const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        onRecorded(new File([blob], `语音-${Date.now()}.${extension}`, { type }));
      };
      recorder.start(1000);
      const startedAt = Date.now();
      setSeconds(0);
      setRecording(true);
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        setSeconds(elapsed);
        if (elapsed >= 300 && recorder.state === "recording") recorder.stop();
      }, 250);
    } catch {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      onError("无法录音，请检查麦克风权限及设备连接。");
    } finally { if (mountedRef.current) setRequesting(false); }
  };

  return recording ? <div className="voice-recording" role="group" aria-label="正在录音">
    <span role="status">录音 {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span>
    <button type="button" onClick={() => stop()} title="完成录音" aria-label="完成录音"><Square size={18} /></button>
    <button type="button" onClick={() => stop(true)} title="取消录音" aria-label="取消录音"><X size={18} /></button>
  </div> : <button className="chat-voice-button" type="button" onClick={() => void start()} disabled={requesting} title={requesting ? "正在请求麦克风权限" : "录制语音"} aria-label="录制语音"><Mic size={20} aria-hidden="true" /></button>;
}
