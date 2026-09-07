import { after, NextRequest, NextResponse } from "next/server";
import { currentIdentityId } from "../../identity/session";
import { getUser, listRoomMembers } from "../../identity/store";
import { finishRing, listRings, RingError, startRing } from "./store";
import { startRingScheduler, tickRings } from "./scheduler";

export const runtime = "nodejs";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return parsed.host === request.headers.get("host") && (parsed.protocol === "https:" || (parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname)));
  } catch { return false; }
}
export async function GET() {
  const identityId = await currentIdentityId();
  if (!identityId) return json({ error: "请先登录" }, 401);
  return json({ identityId, rings: await listRings(identityId), members: (await listRoomMembers()).filter(m => m.id !== identityId), serverNow: Date.now() });
}
export async function POST(request: NextRequest) {
  const identityId = await currentIdentityId();
  if (!identityId) return json({ error: "请先登录" }, 401);
  if (!sameOrigin(request)) return json({ error: "无效来源" }, 403);
  const body = await request.json().catch(() => ({}));
  if (typeof body.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id)
    || typeof body.recipientId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(body.recipientId)) return json({ error: "无效提醒" }, 400);
  const [sender, recipient] = await Promise.all([getUser(identityId), getUser(body.recipientId)]);
  if (!sender || !recipient) return json({ error: "成员不存在" }, 404);
  try {
    const result = await startRing({ id: body.id, senderId: identityId, recipientId: body.recipientId, senderName: sender.nickname || "成员", recipientName: recipient.nickname || "成员" });
    startRingScheduler();
    if (result.created) after(() => tickRings());
    return json(result, result.created ? 201 : 200);
  } catch (error) {
    if (error instanceof RingError) return json({ error: error.message }, error.status);
    throw error;
  }
}
export async function PATCH(request: NextRequest) {
  const identityId = await currentIdentityId();
  if (!identityId) return json({ error: "请先登录" }, 401);
  if (!sameOrigin(request)) return json({ error: "无效来源" }, 403);
  const body = await request.json().catch(() => ({}));
  if (typeof body.id !== "string" || (body.action !== "acknowledge" && body.action !== "cancel")) return json({ error: "无效操作" }, 400);
  try { return json({ ring: await finishRing(body.id, identityId, body.action) }); }
  catch (error) { if (error instanceof RingError) return json({ error: error.message }, error.status); throw error; }
}
