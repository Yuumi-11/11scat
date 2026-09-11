"use client";
import { useEffect, useRef, useState } from 'react';
export function RemoteMicrophone({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const audio = ref.current; if (!audio) return;
    let active = true; audio.srcObject = stream;
    void audio.play().then(() => { if (active) setBlocked(false); }, () => { if (active) setBlocked(true); });
    return () => { active = false; audio.pause(); audio.srcObject = null; };
  }, [stream]);
  return <><audio ref={ref} autoPlay />{blocked && <button className="room-audio-enable" type="button" onClick={() => void ref.current?.play().then(() => setBlocked(false), () => undefined)}>开启通话声音</button>}</>;
}
