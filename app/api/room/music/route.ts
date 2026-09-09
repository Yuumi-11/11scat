import { NextResponse } from "next/server";
import path from "node:path";
import { currentIdentityId } from "../../identity/session";
import { listRoomMembers } from "../../identity/store";
import { createMusicStore, MusicError } from "./store";
import type { MusicSnapshot } from "../../../music-types";
export const runtime = "nodejs";
const store = createMusicStore(
  process.env.DATA_DIR ||
    (process.env.NODE_ENV === "production"
      ? "/data"
      : path.join(process.cwd(), ".data")),
  listRoomMembers,
);
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
function presence(snapshot: MusicSnapshot) {
  const entries = (
    globalThis as typeof globalThis & {
      __studyRoomPresence?: Map<
        string,
        { identityId: string; expiresAt: number }
      >;
    }
  ).__studyRoomPresence;
  if (!entries) return snapshot;
  const online = new Set(
    [...entries.values()]
      .filter((p) => p.expiresAt > Date.now())
      .map((p) => p.identityId),
  );
  return {
    ...snapshot,
    members: snapshot.members.map((m) => ({
      ...m,
      online: m.id === snapshot.selfId || online.has(m.id),
    })),
  };
}
export async function GET() {
  const actor = await currentIdentityId();
  if (!actor) return json({ error: "请先登录自习室" }, 401);
  try {
    return json(presence(await store.snapshot(actor)));
  } catch (e) {
    return json(
      { error: e instanceof MusicError ? e.message : "音乐状态暂不可用" },
      e instanceof MusicError ? e.status : 503,
    );
  }
}
export async function POST(request: Request) {
  const actor = await currentIdentityId();
  if (!actor) return json({ error: "请先登录自习室" }, 401);
  const origin = request.headers.get("origin");
  try {
    if (!origin || new URL(origin).host !== request.headers.get("host"))
      return json({ error: "无效来源" }, 403);
  } catch {
    return json({ error: "无效来源" }, 403);
  }
  try {
    const text = await request.text();
    if (text.length > 4096) return json({ error: "内容过长" }, 413);
    const command = JSON.parse(text);
    if (!command || typeof command !== "object" || Array.isArray(command))
      return json({ error: "操作无效" }, 400);
    return json(presence(await store.command(actor, command)));
  } catch (e) {
    return json(
      { error: e instanceof MusicError ? e.message : "音乐操作未完成，请重试" },
      e instanceof MusicError ? e.status : 503,
    );
  }
}
