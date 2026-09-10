import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const ACCESS_COOKIE = "ss_access";

const identityPattern = /^[A-Za-z0-9_-]{1,64}$/;

function base64url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function verifyIdentitySession(token?: string): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [identityId, expiresAtText, suppliedSignature] = parts;
  if (!identityPattern.test(identityId) || !/^\d+$/.test(expiresAtText)) return false;
  if (Number(expiresAtText) <= Math.floor(Date.now() / 1000)) return false;
  const secret = process.env.AUTH_SESSION_SECRET
    || process.env.TICKTICK_STORAGE_SECRET
    || process.env.TICKTICK_COOKIE_SECRET
    || process.env.SITE_PASSWORD;
  if (!secret) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = base64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${identityId}.${expiresAtText}`)));
  return signature === suppliedSignature;
}

export async function proxy(request: NextRequest) {
  // An isolated, fixture-only visual preview. It is unavailable in production.
  if (process.env.NODE_ENV === "development" && ["/classroom-preview", "/classroom-preview/fonts", "/classroom-preview/chalk-art"].includes(request.nextUrl.pathname)) return NextResponse.next();
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!(await verifyIdentitySession(token))) {
    const accessUrl = new URL("/access", request.url);
    accessUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(accessUrl);
  }

  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  matcher: ["/((?!access|api/access|api/chat/files|_next/static|_next/image|classroom/|favicon.svg|sw.js|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)"],
};
