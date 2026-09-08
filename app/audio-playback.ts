import { execFile } from "node:child_process";
import { stat, rename, unlink } from "node:fs/promises";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";

const execute = promisify(execFile);
type AudioQueue = { tail: Promise<unknown>; pending: Map<string, Promise<string>> };
const shared = globalThis as typeof globalThis & { chatAudioQueue?: AudioQueue };
const queue = shared.chatAudioQueue ||= { tail: Promise.resolve(), pending: new Map() };
const exists = async (file: string) => (await stat(file).catch(() => null))?.size;

/** Build once on explicit playback; preserve the original and cap CPU, size and runtime. */
export async function compatibleAudio(source: string): Promise<string> {
  const cached = `${source}.playback-v1.m4a`;
  if (await exists(cached)) return cached;
  const pending = queue.pending.get(source); if (pending) return pending;
  if (queue.pending.size >= 8) throw new Error("语音准备较繁忙，请稍后重试");
  const work = queue.tail.then(async () => {
    if (await exists(cached)) return cached;
    const info = await stat(source);
    if (info.size > 25 * 1024 * 1024) throw new Error("语音文件过大，请下载后播放");
    const probe = await execute(process.env.FFPROBE_PATH || "ffprobe", ["-v", "error", "-protocol_whitelist", "file,pipe", "-format_whitelist", "matroska,webm,mov,mp3,wav,ogg,flac,aac", "-show_entries", "format=duration", "-of", "json", source], { timeout: 10000, maxBuffer: 65536, windowsHide: true });
    const duration = Number(JSON.parse(probe.stdout).format?.duration);
    if (Number.isFinite(duration) && duration > 305) throw new Error("长音频请下载后播放");
    const temp = `${source}.${randomUUID()}.m4a`;
    try {
      await execute(process.env.FFMPEG_PATH || "ffmpeg", ["-nostdin", "-v", "error", "-protocol_whitelist", "file,pipe", "-format_whitelist", "matroska,webm,mov,mp3,wav,ogg,flac,aac", "-threads", "1", "-i", source, "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "44100", "-c:a", "aac", "-b:a", "64k", "-threads", "1", "-t", "306", "-movflags", "+faststart", "-y", temp], { timeout: 45000, maxBuffer: 65536, windowsHide: true });
      const result = await execute(process.env.FFPROBE_PATH || "ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", temp], { timeout: 10000, maxBuffer: 65536, windowsHide: true });
      const outputDuration = Number(JSON.parse(result.stdout).format?.duration);
      if (!Number.isFinite(outputDuration) || outputDuration > 305 || !await exists(temp)) throw new Error("语音无法完整转换，请下载原文件播放");
      await rename(temp, cached); return cached;
    } finally { await unlink(temp).catch(() => undefined); }
  });
  queue.pending.set(source, work); queue.tail = work.catch(() => undefined);
  try { return await work; } finally { queue.pending.delete(source); }
}
