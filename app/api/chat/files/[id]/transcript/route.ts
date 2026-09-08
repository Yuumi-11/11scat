import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { currentIdentityId } from "../../../../identity/session";
import { getUser } from "../../../../identity/store";
import { sentAudioAttachment } from "../../../store";
import { compatibleAudio } from "../../../../../audio-playback";
import { createSpeechService, SpeechError } from "../../../../../speech-transcription";

export const runtime = "nodejs";
const directory = process.env.DATA_DIR || (process.env.NODE_ENV === "production" ? "/data" : path.join(process.cwd(), ".data"));
const execute = promisify(execFile);
const shared = globalThis as typeof globalThis & { chatSpeechService?: ReturnType<typeof createSpeechService> };
const service = shared.chatSpeechService ||= createSpeechService({
  directory: path.join(directory, "speech"),
  config: () => ({ account: process.env.CLOUDFLARE_ACCOUNT_ID || "", token: process.env.CLOUDFLARE_WORKERS_AI_TOKEN || "", freePlan: process.env.CLOUDFLARE_AI_FREE_PLAN_CONFIRMED === "true" }),
  prepare: async id => {
    if (!await sentAudioAttachment(id)) throw new SpeechError("语音不存在或已撤回", 404);
    const file = await compatibleAudio(path.join(directory, "chat-files", `${id}.bin`));
    if ((await stat(file)).size > 4 * 1024 * 1024) throw new SpeechError("语音文件过大", 413);
    const probe = await execute(process.env.FFPROBE_PATH || "ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", file], { timeout: 10000, maxBuffer: 65536, windowsHide: true });
    return { audio: await readFile(file), seconds: Number(JSON.parse(probe.stdout).format?.duration) };
  },
});
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const identity = await currentIdentityId();
  if (!identity || !await getUser(identity)) return json({ error: "请先登录自习室" }, 401);
  try {
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).host !== request.headers.get("host")) return json({ error: "无效来源" }, 403);
  } catch { return json({ error: "无效来源" }, 403); }
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return json({ error: "语音不存在" }, 404);
  try {
    if (!await sentAudioAttachment(id)) return json({ error: "语音不存在或已撤回" }, 404);
    const text = await service.transcribe(id);
    if (!await sentAudioAttachment(id)) return json({ error: "语音已撤回" }, 404);
    return json({ text });
  } catch (error) { return json({ error: error instanceof SpeechError ? error.message : "转写暂时不可用，请稍后重试" }, error instanceof SpeechError ? error.status : 503); }
}
