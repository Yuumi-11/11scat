"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { claimVoice, playVoice, releaseVoice } from "./voice-playback-controller";
import { VoiceTranscript } from "./VoiceTranscript";
import "./voice-transcript.css";

function time(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function AudioPlayer({ src, name }: { src: string; name: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const audio = ref.current;
    return () => { if (audio) releaseVoice(audio); };
  }, []);
  const sync = () => {
    const audio = ref.current;
    if (!audio) return;
    setPosition(audio.currentTime);
    if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
  };
  const toggle = () => {
    const audio = ref.current;
    if (!audio) return;
    if (!audio.paused) { audio.pause(); return; }
    setError("");
    if (audio.error) audio.load();
    if (audio.ended) audio.currentTime = 0;
    // Invoke play directly within the tap, preserving iOS user activation.
    setLoading(true);
    void playVoice(audio).catch((reason: unknown) => {
      setLoading(false);
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError("语音暂时无法播放，请点击重试。");
    });
  };
  return <div className="voice-player" role="group" aria-label={`语音：${name}`}>
    <audio ref={ref} preload="none" playsInline src={`${src}${src.includes("?") ? "&" : "?"}playback=1`}
      onLoadedMetadata={sync} onDurationChange={sync} onTimeUpdate={sync} onSeeked={sync}
      onPlay={() => { if (ref.current && !ref.current.paused) claimVoice(ref.current); setPlaying(!ref.current?.paused); }} onPlaying={() => setLoading(false)}
      onWaiting={() => setLoading(true)} onCanPlay={() => setLoading(false)}
      onPause={() => { setPlaying(false); setLoading(false); }}
      onEnded={() => { sync(); setPlaying(false); setLoading(false); }}
      onError={() => { setPlaying(false); setLoading(false); setError("语音加载失败，请点击重试。"); }} />
    <button type="button" className="voice-play-toggle" onClick={toggle} aria-label={playing ? "暂停语音" : "播放语音"}>
      {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
    </button>
    <div className="voice-player-track">
      <div className="voice-player-time"><span>{time(position)} / {duration > 0 ? time(duration) : "--:--"}</span>{loading && <span role="status">加载中…</span>}</div>
      <input type="range" min={0} max={duration || 1} step={0.01} value={Math.min(position, duration || 0)} disabled={!duration}
        aria-label="语音播放进度" aria-valuetext={`${time(position)}，总时长 ${duration ? time(duration) : "加载中"}`}
        style={{ background: `linear-gradient(to right, var(--theme-accent-dark) ${duration ? position / duration * 100 : 0}%, var(--line-strong, #cbd5e1) 0%)` }}
        onChange={(event) => {
          if (!ref.current || !duration) return;
          const next = Number(event.target.value);
          ref.current.currentTime = next;
          setPosition(next);
        }} />
    </div>
    {error && <span className="voice-player-error" role="alert">{error}<a href={src} download={name}>下载原语音</a></span>}
    <VoiceTranscript key={src} src={src} />
  </div>;
}
