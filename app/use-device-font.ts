"use client";
import { useEffect, useState } from 'react';
import { isDeviceFontReady, loadDeviceFont, normalizeDeviceFont } from './device-fonts';

export function useDeviceFont(font: string, enabled: boolean) {
  const id = normalizeDeviceFont(font);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ id: string; attempt: number; status: 'ready' | 'error' } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadDeviceFont(id).then(() => { if (!cancelled) setResult({ id, attempt, status: 'ready' }); })
      .catch(() => { if (!cancelled) setResult({ id, attempt, status: 'error' }); });
    return () => { cancelled = true; };
  }, [id, attempt, enabled]);
  const status = isDeviceFontReady(id) ? 'ready' : result?.id === id && result.attempt === attempt ? result.status : 'loading';
  return { status, retry: () => setAttempt(value => value + 1) };
}
