"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { requestScreenShare } from '../screen-share';

type Kind = 'screen' | 'camera' | 'microphone';
type Streams = Record<Kind, MediaStream | null>;
const empty = (): Streams => ({ screen: null, camera: null, microphone: null });

export function usePreviewMedia(onError: (message: string) => void) {
  const [streams, setStreams] = useState<Streams>(empty);
  const current = useRef<Streams>(empty());
  const pending = useRef(new Set<Kind>());
  const version = useRef({ screen: 0, camera: 0, microphone: 0 });
  const mounted = useRef(true);
  const stop = useCallback((kind: Kind) => {
    version.current[kind]++;
    current.current[kind]?.getTracks().forEach(track => track.stop());
    current.current[kind] = null;
    if (mounted.current) setStreams({ ...current.current });
  }, []);
  const stopAll = useCallback(() => {
    for (const kind of ['screen', 'camera', 'microphone'] as const) stop(kind);
  }, [stop]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; stopAll(); };
  }, [stopAll]);

  const toggle = async (kind: Kind) => {
    if (current.current[kind]) { stop(kind); return false; }
    if (pending.current.has(kind)) return false;
    pending.current.add(kind);
    const requestVersion = ++version.current[kind];
    onError('');
    try {
      const stream = kind === 'screen' ? await requestScreenShare()
        : await navigator.mediaDevices.getUserMedia(kind === 'camera' ? { video: true, audio: false } : { video: false, audio: true });
      const track = kind === 'microphone' ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];
      if (!mounted.current || requestVersion !== version.current[kind] || track?.readyState !== 'live') {
        stream.getTracks().forEach(item => item.stop());
        return false;
      }
      track.addEventListener('ended', () => { if (current.current[kind] === stream) stop(kind); }, { once: true });
      current.current[kind] = stream;
      setStreams({ ...current.current });
      return true;
    } catch (cause) {
      if (mounted.current && requestVersion === version.current[kind] && (cause as DOMException).name !== 'NotAllowedError') {
        onError(cause instanceof Error ? cause.message : '设备未能开启，请重试');
      }
      return false;
    } finally { pending.current.delete(kind); }
  };
  return { streams, toggle, stopAll };
}
