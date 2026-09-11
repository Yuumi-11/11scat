"use client";

export function RoomLoadingScreen({ error, onRetry }: { error?: string; onRetry?: () => void }) {
  return <main className="access-shell">
    <section className="access-card room-loading-card" aria-busy={!error}>
      <div className="access-brand"><span className="brand-mark">11</span><strong>11scat</strong></div>
      {error ? <>
        <h1>暂时未能进入自习室</h1>
        <p className="access-error" role="alert">{error}</p>
        <button className="primary-button access-submit" onClick={onRetry}>重新加载</button>
      </> : <div role="status" aria-live="polite">
        <span className="room-entry-spinner" aria-hidden="true" />
        <h1>正在准备自习室</h1>
        <p>正在加载字体和教室，准备好后会自动进入。</p>
      </div>}
    </section>
  </main>;
}
