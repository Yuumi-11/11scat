"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClassroomAction, ClassroomProfile } from './classroom-members';
export function useClassroomProfile(joined: boolean, broadcast: (message: object) => void) {
  const [profile, setProfile] = useState<ClassroomProfile>({ members: [], seats: [], font: 'resource-rounded' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false), generation = useRef(0);
  useEffect(() => {
    if (!joined) return;
    let cancelled = false;
    const controller = new AbortController();
    const refresh = () => {
      if (busy.current || document.hidden) return;
      const current = ++generation.current;
      void fetch('/api/room/classroom', { cache: 'no-store', signal: controller.signal }).then(async response => {
        if (!response.ok) throw new Error('座位暂时无法读取');
        const value = await response.json() as ClassroomProfile;
        if (!cancelled && current === generation.current) { setProfile(value); setError(''); }
      }).catch(() => { if (!cancelled && current === generation.current) setError('设置暂时无法读取'); });
    };
    refresh(); window.addEventListener('focus', refresh); window.addEventListener('classroom-settings-changed', refresh);
    // Realtime messages refresh immediately; polling also reaches other devices without media connections.
    const timer = window.setInterval(refresh, 15_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { cancelled = true; controller.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh); window.removeEventListener('classroom-settings-changed', refresh); };
  }, [joined]);
  const act = useCallback(async (action: ClassroomAction) => {
    if (!joined || busy.current) return;
    busy.current = true; ++generation.current;
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/room/classroom', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || '座位保存失败');
      setProfile(value); broadcast({ type: 'classroom-settings-changed' });
    } catch (failure) { setError(failure instanceof Error ? failure.message : '座位保存失败'); }
    finally { busy.current = false; setSaving(false); }
  }, [joined, broadcast]);
  return { profile, saving, error, act };
}
