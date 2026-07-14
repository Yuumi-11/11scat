import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const ACCESS_COOKIE = "ss_access";

function accessToken(password: string): string {
  return createHash("sha256").update(`11scat-access:${password}`).digest("hex");
}

export function proxy(request: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return new NextResponse("11scat password protection is not configured.", { status: 503 });

  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  if (token !== accessToken(password)) {
    return NextResponse.redirect(new URL("/access", request.url));
  }

  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  matcher: ["/((?!access|api/access|_next/static|_next/image|favicon.svg|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)"],
};
