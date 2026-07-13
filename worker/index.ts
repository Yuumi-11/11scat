/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  SITE_PASSWORD?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

const ACCESS_COOKIE = "ss_access";

async function accessToken(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(`11scat-access:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readCookie(request: Request, name: string): string | null {
  const cookies = request.headers.get("Cookie") ?? "";
  for (const entry of cookies.split(";")) {
    const [key, ...value] = entry.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

function loginPage(hasError = false): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>访问 11scat</title>
  <style>
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 50% 0%,rgba(124,131,255,.18),transparent 34rem),#080b13;color:#f4f7ff;font-family:Arial,"Microsoft YaHei",sans-serif}.card{width:min(420px,100%);padding:34px;border:1px solid rgba(255,255,255,.1);border-radius:24px;background:linear-gradient(145deg,rgba(22,29,47,.96),rgba(12,16,27,.98));box-shadow:0 30px 100px rgba(0,0,0,.45)}.brand{display:flex;align-items:center;gap:11px;font-size:18px;font-weight:800}.mark{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg,#858cff,#6268d7);font-size:12px}.eyebrow{display:block;margin-top:34px;color:#7f889b;font-size:10px;font-weight:700;letter-spacing:.14em}h1{margin:8px 0 10px;font-size:28px;letter-spacing:-.05em}p{margin:0 0 22px;color:#929bad;font-size:13px;line-height:1.7}label{display:block;margin-bottom:8px;color:#c9cfdb;font-size:12px}input{width:100%;height:48px;border:1px solid rgba(255,255,255,.11);border-radius:12px;padding:0 14px;background:#0a0f1a;color:#fff;font-size:18px;letter-spacing:.14em;outline:none}input:focus{border-color:#7c83ff;box-shadow:0 0 0 3px rgba(124,131,255,.12)}button{width:100%;height:46px;margin-top:12px;border:0;border-radius:12px;background:linear-gradient(135deg,#858cff,#686ee4);color:#fff;font-weight:800;cursor:pointer}.error{margin:10px 0 0;color:#ff9999;font-size:12px}.note{display:block;margin-top:18px;color:#687185;font-size:10px;text-align:center}
  </style>
</head>
<body>
  <main class="card">
    <div class="brand"><span class="mark">11</span><span>11scat</span></div>
    <span class="eyebrow">PRIVATE STUDY SPACE</span>
    <h1>输入访问密码</h1>
    <p>这个自习空间仅向受邀访客开放。</p>
    <form action="/__access" method="post">
      <label for="password">访问密码</label>
      <input id="password" name="password" type="password" inputmode="numeric" autocomplete="current-password" required autofocus />
      ${hasError ? '<div class="error" role="alert">密码不正确，请重新输入。</div>' : ""}
      <button type="submit">进入 11scat</button>
    </form>
    <span class="note">验证成功后，此设备将在 7 天内保持访问状态。</span>
  </main>
</body>
</html>`;
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (!env.SITE_PASSWORD) {
      return htmlResponse("<h1>11scat 尚未配置访问密码</h1>", 503);
    }

    const expectedToken = await accessToken(env.SITE_PASSWORD);

    if (url.pathname === "/__access" && request.method === "POST") {
      const form = await request.formData();
      const submitted = form.get("password");
      if (typeof submitted === "string" && submitted === env.SITE_PASSWORD) {
        return new Response(null, {
          status: 303,
          headers: {
            Location: "/",
            "Set-Cookie": `${ACCESS_COOKIE}=${expectedToken}; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax`,
            "Cache-Control": "no-store",
          },
        });
      }
      return htmlResponse(loginPage(true), 401);
    }

    if (readCookie(request, ACCESS_COOKIE) !== expectedToken) {
      return htmlResponse(loginPage());
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const response = await handler.fetch(request, env, ctx);
    const headers = new Headers(response.headers);
    headers.set("X-Robots-Tag", "noindex, nofollow");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};

export default worker;
