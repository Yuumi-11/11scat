export function safeAccessReturn(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\u0000-\u0020\\]/.test(value)) return "/";
  try {
    const url = new URL(value, "https://local.invalid");
    if (url.origin !== "https://local.invalid" || /^\/(?:access|api\/access)(?:\/|$)/.test(url.pathname)) return "/";
    return `${url.pathname}${url.search}`;
  } catch { return "/"; }
}
