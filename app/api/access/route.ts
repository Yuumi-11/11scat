import { NextResponse } from "next/server";
import { ACCESS_COOKIE, createIdentitySession, resolveIdentityCode } from "../identity/session";

export async function POST(request: Request) {
  const form = await request.formData();
  const submitted = form.get("identityCode");
  const requestedNext = form.get("next");
  const next = typeof requestedNext === "string" && requestedNext.startsWith("/") && !requestedNext.startsWith("//")
    ? requestedNext
    : "/";
  const identityId = typeof submitted === "string" ? resolveIdentityCode(submitted.trim()) : null;
  if (!identityId) {
    const accessParams = new URLSearchParams({ error: "1", next });
    return new NextResponse(null, {
      status: 303,
      headers: { Location: `/access?${accessParams.toString()}` },
    });
  }

  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: next },
  });
  response.cookies.set(ACCESS_COOKIE, createIdentitySession(identityId), {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
