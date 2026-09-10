"use client";
import { useCallback, useEffect, useState } from 'react';
import type { ClassroomProfile } from './classroom-members';
export function useClassroomProfile(joined: boolean, broadcast: (message: object) => void) {
  const [profile, setProfile] = useState<ClassroomProfile>({ members: [], seats: [], font: 'youyuan' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!joined) return;
    let cancelled = false;
    const refresh = () => {
      void fetch('/api/room/classroom', { cache: 'no-store' }).then(async response => {
        if (!response.ok) throw new Error('座位暂时无法读取');
        const value = await response.json() as ClassroomProfile;
        if (!cancelled) { setProfile(value); setError(''); }
      }).catch(() => { if (!cancelled) setError('座位暂时无法读取，请稍后在设置中重试'); });
    };
    refresh(); window.addEventListener('focus', refresh); window.addEventListener('classroom-settings-changed', refresh);
    return () => { cancelled = true; window.removeEventListener('focus', refresh); window.removeEventListener('classroom-settings-changed', refresh); };
  }, [joined]);
  const save = useCallback(async (next: ClassroomProfile) => {
    if (saving) return;
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/room/classroom', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seats: next.seats, font: next.font }) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || '座位保存失败');
      setProfile(value); broadcast({ type: 'classroom-settings-changed' });
    } catch (failure) { setError(failure instanceof Error ? failure.message : '座位保存失败'); }
    finally { setSaving(false); }
  }, [saving, broadcast]);
  return { profile, saving, error, save };
}
