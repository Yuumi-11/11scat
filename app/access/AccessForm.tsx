"use client";

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { safeAccessReturn } from '../access-return';
import { prepareClassroomAssets } from '../classroom-loading';
import { RoomLoadingScreen } from '../RoomLoadingScreen';

export function AccessForm({ next, invalid }: { next: string; invalid: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState(invalid ? '识别码无效，请重新输入。' : '');
  const destination = useRef('');

  const enter = async () => {
    setError(''); setPreparing(true);
    try {
      const target = destination.current;
      if (new URL(target, window.location.origin).pathname === '/') {
        router.prefetch(target);
        await prepareClassroomAssets();
      }
      router.replace(target);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '教室未能加载，请重试。');
    }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    const form = event.currentTarget;
    try {
      const response = await fetch('/api/access', { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
      if (response.status === 401) { setError('识别码无效，请重新输入。'); return; }
      if (!response.ok) throw new Error('暂时无法登录，请重试。');
      const result = await response.json();
      setDisplayName(typeof result.displayName === 'string' ? result.displayName : '');
      destination.current = safeAccessReturn(result.next);
      form.reset();
      await enter();
    } catch (failure) {
      setError(failure instanceof Error && failure.name !== 'TimeoutError' ? failure.message : '登录超时，请检查网络后重试。');
    } finally { setBusy(false); }
  };

  if (preparing) return <RoomLoadingScreen displayName={displayName} error={error} onRetry={() => { void enter(); }} />;
  return <main className="access-shell"><section className="access-card">
    <div className="access-brand"><span className="brand-mark">11</span><strong>11scat</strong></div>
    <span className="eyebrow access-eyebrow">PRIVATE STUDY SPACE</span>
    <h1>输入身份识别码</h1>
    <p>输入身份验证码后会自动进入同一个自习房间，并恢复你的昵称与个人连接。</p>
    <form action="/api/access" method="post" onSubmit={submit} aria-busy={busy}>
      <input type="hidden" name="next" value={next} />
      <label htmlFor="identityCode">身份识别码</label>
      <input id="identityCode" name="identityCode" type="password" inputMode="numeric" autoComplete="current-password" required autoFocus disabled={busy} />
      {error && <div className="access-error" role="alert">{error}</div>}
      <button className="primary-button access-submit" type="submit" disabled={busy}>{busy ? '正在验证…' : '进入 11scat'}</button>
    </form>
    <small>为了安全，页面和日志不会显示完整识别码。</small>
  </section></main>;
}
