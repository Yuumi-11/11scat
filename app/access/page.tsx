type AccessPageProps = {
  searchParams: Promise<{ error?: string; next?: string }>;
};

export const metadata = {
  title: "访问 11scat",
  robots: { index: false, follow: false },
};

export default async function AccessPage({ searchParams }: AccessPageProps) {
  const { error, next } = await searchParams;

  return (
    <main className="access-shell">
      <section className="access-card">
        <div className="access-brand">
          <span className="brand-mark">11</span>
          <strong>11scat</strong>
        </div>
        <span className="eyebrow access-eyebrow">PRIVATE STUDY SPACE</span>
        <h1>输入访问密码</h1>
        <p>这个自习空间仅向受邀访客开放。</p>
        <form action="/api/access" method="post">
          <input type="hidden" name="next" value={next || "/"} />
          <label htmlFor="password">访问密码</label>
          <input
            id="password"
            name="password"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            required
            autoFocus
          />
          {error && <div className="access-error" role="alert">密码不正确，请重新输入。</div>}
          <button className="primary-button access-submit" type="submit">进入 11scat</button>
        </form>
        <small>验证成功后，此设备将在 7 天内保持访问状态。</small>
      </section>
    </main>
  );
}
