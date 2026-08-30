type AccessPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export const metadata = {
  title: "访问 11scat",
  robots: { index: false, follow: false },
};

export default async function AccessPage({ searchParams }: AccessPageProps) {
  const { error } = await searchParams;

  return (
    <main className="access-shell">
      <section className="access-card">
        <div className="access-brand">
          <span className="brand-mark">11</span>
          <strong>11scat</strong>
        </div>
        <span className="eyebrow access-eyebrow">PRIVATE STUDY SPACE</span>
        <h1>输入身份识别码</h1>
        <p>输入身份验证码后会自动进入同一个自习房间，并恢复你的昵称与个人连接。</p>
        <form action="/api/access" method="post">
          <label htmlFor="identityCode">身份识别码</label>
          <input
            id="identityCode"
            name="identityCode"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            required
            autoFocus
          />
          {error && <div className="access-error" role="alert">识别码无效，请重新输入。</div>}
          <button className="primary-button access-submit" type="submit">进入 11scat</button>
        </form>
        <small>为了安全，页面和日志不会显示完整识别码。</small>
      </section>
    </main>
  );
}
