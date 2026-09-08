import { execFile } from "node:child_process";
import { rename, stat, unlink } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);
const pending = new Map<string, Promise<string>>();
let queue: Promise<unknown> = Promise.resolve();

// Keep originals intact. A finalized AAC/MP4 copy has duration and seek metadata,
// including for older MediaRecorder WebM files with an unknown duration.
export async function compatibleAudio(source: string): Promise<string> {
  const target = `${source}.playback-v1.m4a`;
  if (await stat(target).then((info) => info.size > 0, () => false)) return target;
  const existing = pending.get(target);
  if (existing) return existing;
  const job = queue.catch(() => {}).then(async () => {
    const temporary = `${target}.${crypto.randomUUID()}.tmp`;
    try {
      await run(process.env.FFMPEG_PATH || "ffmpeg", [
        "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-protocol_whitelist", "file,pipe", "-i", source,
        "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "44100",
        "-c:a", "aac", "-b:a", "64k", "-threads", "1",
        "-movflags", "+faststart", "-f", "mp4", temporary,
      ], { timeout: 60_000, maxBuffer: 256 * 1024, windowsHide: true });
      await rename(temporary, target);
      return target;
    } finally {
      await unlink(temporary).catch(() => {});
    }
  });
  queue = job;
  pending.set(target, job);
  try { return await job; } finally { pending.delete(target); }
}
