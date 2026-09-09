import { currentIdentityId } from "../../../identity/session";
import { listRoomMembers } from "../../../identity/store";
import { createListenState, ListenError } from "./state";
export const runtime = "nodejs";
const globals = globalThis as typeof globalThis & {
  musicListenState?: ReturnType<typeof createListenState>;
};
const state = (globals.musicListenState ||= createListenState());
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function GET() {
  const actor = await currentIdentityId();
  if (!actor) return json({ error: "请先登录" }, 401);
  const people = await listRoomMembers();
  if (!people.some((p) => p.id === actor))
    return json({ error: "请重新登录" }, 401);
  return json(state.view(actor, people));
}
export async function POST(request: Request) {
  const actor = await currentIdentityId();
  if (!actor) return json({ error: "请先登录" }, 401);
  try {
    if (
      new URL(request.headers.get("origin") || "").host !==
      request.headers.get("host")
    )
      return json({ error: "无效来源" }, 403);
    const text = await request.text();
    if (text.length > 70000) return json({ error: "请求过长" }, 413);
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body))
      return json({ error: "无效请求" }, 400);
    const people = await listRoomMembers();
    const result = state.command(actor, body, people);
    return json(result);
  } catch (e) {
    return json(
      { error: e instanceof ListenError ? e.message : "音乐操作未完成" },
      e instanceof ListenError ? e.status : 400,
    );
  }
}
