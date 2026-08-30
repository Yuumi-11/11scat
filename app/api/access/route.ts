import { NextResponse } from "next/server";
import { ACCESS_COOKIE, createIdentitySession, resolveIdentityCode } from "../identity/session";

export async function POST(request: Request) {
  const form = await request.formData();
  const submitted = form.get("identityCode");
  const identityId = typeof submitted === "string" ? resolveIdentityCode(submitted.trim()) : null;
  if (!identityId) {
    return new NextResponse(null, {
      status: 303,
      headers: { Location: "/access?error=1" },
    });
  }

  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: "/" },
  });
  response.cookies.set(ACCESS_COOKIE, createIdentitySession(identityId), {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
