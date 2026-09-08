import { NextResponse } from "next/server";
import { ACCESS_COOKIE, createIdentitySession, resolveIdentityCode } from "../identity/session";
import { safeAccessReturn } from "../../access-return";

export async function POST(request: Request) {
  const form = await request.formData();
  const returnTo = safeAccessReturn(form.get("next"));
  const submitted = form.get("identityCode");
  const identityId = typeof submitted === "string" ? resolveIdentityCode(submitted.trim()) : null;
  if (!identityId) {
    return new NextResponse(null, {
      status: 303,
      headers: { Location: `/access?error=1&next=${encodeURIComponent(returnTo)}` },
    });
  }

  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: returnTo },
  });
  response.cookies.set(ACCESS_COOKIE, createIdentitySession(identityId), {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
