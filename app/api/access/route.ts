import { NextResponse } from "next/server";
import { ACCESS_COOKIE, createIdentitySession, resolveIdentityCode } from "../identity/session";
import { safeAccessReturn } from "../../access-return";
import { getUser, updateUser } from '../identity/store';

export async function POST(request: Request) {
  const wantsJson = request.headers.get('accept')?.includes('application/json');
  const form = await request.formData();
  const returnTo = safeAccessReturn(form.get("next"));
  const submitted = form.get("identityCode");
  const identityId = typeof submitted === "string" ? resolveIdentityCode(submitted.trim()) : null;
  if (!identityId) {
    if (wantsJson) return NextResponse.json({ error: '识别码无效，请重新输入。' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    return new NextResponse(null, {
      status: 303,
      headers: { Location: `/access?error=1&next=${encodeURIComponent(returnTo)}` },
    });
  }

  if (!await getUser(identityId)) await updateUser(identityId, current => current || { nickname: identityId.slice(0, 24), updatedAt: new Date().toISOString() });
  const response = wantsJson ? NextResponse.json({ next: returnTo }, { headers: { 'Cache-Control': 'no-store' } }) : new NextResponse(null, {
    status: 303,
    headers: { Location: returnTo },
  });
  response.cookies.set(ACCESS_COOKIE, createIdentitySession(identityId), {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
