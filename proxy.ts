import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const ACCESS_COOKIE = "ss_access";

async function accessToken(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(`11scat-access:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function proxy(request: NextRequest) {
  const password = process.env.SITE_PASSWORD || "1314";

  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  if (token !== (await accessToken(password))) {
    return NextResponse.redirect(new URL("/access", request.url));
  }

  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  matcher: ["/((?!access|api/access|_next/static|_next/image|favicon.svg|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)"],
};
