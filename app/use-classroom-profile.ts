"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { CLASSROOM_DEVICE_FONT, type ClassroomProfile, type ClassroomSettingsDraft } from './classroom-members';
export function useClassroomProfile(joined: boolean, broadcast: (message: object) => void) {
  const [profile, setProfile] = useState<ClassroomProfile>({ members: [], seats: [], font: CLASSROOM_DEVICE_FONT });
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const busy = useRef(false), generation = useRef(0);
  useEffect(() => {
    if (!joined) return;
    let cancelled = false;
    let fetching = false;
    const controller = new AbortController();
    const refresh = () => {
      if (busy.current || fetching || document.hidden) return;
      fetching = true;
      const current = ++generation.current;
      void fetch('/api/room/classroom', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]) }).then(async response => {
        if (!response.ok) throw new Error('座位暂时无法读取');
        const value = await response.json() as ClassroomProfile;
        if (!cancelled && current === generation.current) { setProfile(value); setError(''); setReady(true); }
      }).catch(() => { if (!cancelled && current === generation.current) setError('设置暂时无法读取'); }).finally(() => { fetching = false; });
    };
    refresh(); window.addEventListener('focus', refresh); window.addEventListener('classroom-settings-changed', refresh);
    // Realtime messages refresh immediately; polling also reaches other devices without media connections.
    const timer = window.setInterval(refresh, 15_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { cancelled = true; controller.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh); window.removeEventListener('classroom-settings-changed', refresh); };
  }, [joined]);
  const save = useCallback(async (draft: ClassroomSettingsDraft) => {
    if (!joined) throw new Error('请先进入房间');
    if (busy.current) throw new Error('正在保存，请稍候');
    if (!draft.seat) throw new Error('请选择座位');
    busy.current = true; ++generation.current;
    try {
      const response = await fetch('/api/room/classroom', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-settings', seat: draft.seat }), signal: AbortSignal.timeout(15_000) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || '座位保存失败');
      setProfile(value); setError(''); broadcast({ type: 'classroom-settings-changed' });
    } catch (failure) {
      if (failure instanceof Error && failure.name === 'TimeoutError') throw new Error('保存超时，请重试');
      throw failure;
    } finally { busy.current = false; }
  }, [joined, broadcast]);
  return { profile, error, save, ready };
}
