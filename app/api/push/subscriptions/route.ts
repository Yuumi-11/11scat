import { NextRequest, NextResponse } from "next/server";
import { currentIdentityId } from "../../identity/session";
import { removePushSubscription, savePushSubscription } from "../store";

function validEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

export async function POST(request: NextRequest) {
  const identityId = await currentIdentityId();
  if (!identityId) return new NextResponse("Unauthorized", { status: 401 });
  const body = await request.json().catch(() => ({})) as { subscription?: PushSubscriptionJSON; deviceId?: unknown };
  const subscription = body.subscription;
  const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim().slice(0, 80) : "";
  if (!subscription || !validEndpoint(subscription.endpoint) || !subscription.keys?.p256dh || !subscription.keys.auth || !deviceId) {
    return NextResponse.json({ error: "推送订阅无效" }, { status: 400 });
  }
  await savePushSubscription({
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime ?? null,
    keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
    identityId,
    deviceId,
    updatedAt: Date.now(),
  });
  return NextResponse.json({ enabled: true });
}

export async function DELETE(request: NextRequest) {
  if (!(await currentIdentityId())) return new NextResponse("Unauthorized", { status: 401 });
  const body = await request.json().catch(() => ({})) as { endpoint?: unknown };
  if (!validEndpoint(body.endpoint)) return NextResponse.json({ error: "推送订阅无效" }, { status: 400 });
  await removePushSubscription(body.endpoint);
  return NextResponse.json({ enabled: false });
}
