import { AccessToken } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { currentIdentityId } from '../identity/session';
import { getUser } from '../identity/store';

export const runtime = "nodejs";

export async function GET(request: Request) {
  const memberId = await currentIdentityId();
  const member = memberId ? await getUser(memberId) : null;
  if (!memberId || !member) return new NextResponse('Unauthorized', { status: 401 });
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !url) {
    return NextResponse.json({ error: "LiveKit is not configured" }, { status: 503 });
  }

  const requestUrl = new URL(request.url);
  const requestedName = requestUrl.searchParams.get("name")?.trim();
  if (!requestedName) {
    return NextResponse.json({ error: "A display name is required" }, { status: 400 });
  }
  const name = requestedName.slice(0, 24);
  const requestedIdentity = requestUrl.searchParams.get("identity")?.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 64);
  const identity = requestedIdentity ? `member-${requestedIdentity}` : `member-${crypto.randomUUID()}`;
  const token = new AccessToken(apiKey, apiSecret, { identity, name: member.nickname || name, metadata: JSON.stringify({ identityId: memberId }) });
  token.addGrant({ roomJoin: true, room: "11scat-private-room", canPublish: true, canSubscribe: true, canPublishData: true });

  return NextResponse.json({ token: await token.toJwt(), url });
}
