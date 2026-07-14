import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

const ACCESS_COOKIE = "ss_access";

function accessToken(password: string): string {
  return createHash("sha256").update(`11scat-access:${password}`).digest("hex");
}

function passwordsMatch(submitted: string, expected: string): boolean {
  const submittedBytes = Buffer.from(submitted);
  const expectedBytes = Buffer.from(expected);
  return submittedBytes.length === expectedBytes.length && timingSafeEqual(submittedBytes, expectedBytes);
}

export async function POST(request: Request) {
  const expected = process.env.SITE_PASSWORD || "1314";

  const form = await request.formData();
  const submitted = form.get("password");
  const requestedNext = form.get("next");
  const next = typeof requestedNext === "string" && requestedNext.startsWith("/") && !requestedNext.startsWith("//")
    ? requestedNext
    : "/";
  if (typeof submitted !== "string" || !passwordsMatch(submitted, expected)) {
    const accessUrl = new URL("/access", request.url);
    accessUrl.searchParams.set("error", "1");
    accessUrl.searchParams.set("next", next);
    return NextResponse.redirect(accessUrl, 303);
  }

  const response = NextResponse.redirect(new URL(next, request.url), 303);
  response.cookies.set(ACCESS_COOKIE, accessToken(expected), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
