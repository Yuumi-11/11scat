import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const SPEECH_MODEL = "@cf/openai/whisper-large-v3-turbo";
export class SpeechError extends Error {
  status: number;
  constructor(message: string, status = 503) { super(message); this.status = status; }
}
type Entry = { state: "pending" | "done" | "failed"; text?: string; retryAt?: number };
type Ledger = { version: 1; day: string; seconds: number; blockedUntil: number; entries: Record<string, Entry> };
type Options = {
  directory: string;
  prepare: (id: string) => Promise<{ audio: Buffer; seconds: number }>;
  config: () => { account: string; token: string; freePlan: boolean };
  fetch?: typeof fetch;
  now?: () => number;
};

/** One shared queue per Node server. Quota reservations survive restarts and failed calls. */
export function createSpeechService(options: Options) {
  let tail: Promise<unknown> = Promise.resolve();
  const pending = new Map<string, Promise<string>>();
  const clock = options.now || Date.now, request = options.fetch || fetch;
  const file = path.join(options.directory, "transcripts-v1.json");
  const save = async (ledger: Ledger) => {
    await mkdir(options.directory, { recursive: true, mode: 0o700 });
    const temp = `${file}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(ledger), { mode: 0o600 });
    await rename(temp, file);
  };
  return {
    transcribe(id: string): Promise<string> {
      const existing = pending.get(id); if (existing) return existing;
      if (pending.size >= 6) return Promise.reject(new SpeechError("转写较繁忙，请稍后再试", 429));
      const work = tail.then(async () => {
        let now = clock(), day = new Date(now).toISOString().slice(0, 10);
        let tomorrow = Date.parse(day) + 86400000;
        let ledger: Ledger;
        try { ledger = JSON.parse(await readFile(file, "utf8")); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new SpeechError("转写记录暂时无法读取");
          ledger = { version: 1, day, seconds: 0, blockedUntil: 0, entries: {} };
        }
        if (ledger.version !== 1 || !Number.isFinite(ledger.seconds) || ledger.seconds < 0 || !ledger.entries) throw new SpeechError("转写记录需要维护");
        const key = `${SPEECH_MODEL}:${id}`, cached = ledger.entries[key];
        if (cached?.state === "done") return cached.text || "";
        if (cached?.retryAt && cached.retryAt > now) throw new SpeechError("上次转写尚未成功，请稍后再试；已发送的请求不会自动重发", 429);
        if (ledger.blockedUntil > now) throw new SpeechError("今日转写额度已暂停，请在下次北京时间 08:00 后重试", 429);
        const config = options.config();
        if (!/^[a-f0-9]{32}$/i.test(config.account) || !config.token || !config.freePlan) throw new SpeechError("语音转文字尚未连接，请由部署者配置 Cloudflare 免费账户授权");
        if (ledger.day !== day) { ledger.day = day; ledger.seconds = 0; ledger.blockedUntil = 0; }
        const prepared = await options.prepare(id);
        if (!Number.isFinite(prepared.seconds) || prepared.seconds <= 0 || prepared.seconds > 305 || prepared.audio.length > 4 * 1024 * 1024) throw new SpeechError("这条语音超过转写长度或大小限制", 413);
        // Conversion can cross midnight; account on the day the request is sent.
        now = clock(); day = new Date(now).toISOString().slice(0, 10); tomorrow = Date.parse(day) + 86400000;
        if (ledger.day !== day) { ledger.day = day; ledger.seconds = 0; ledger.blockedUntil = 0; }
        const seconds = Math.ceil(prepared.seconds) + 1;
        // 180 minutes leaves headroom below the model's theoretical 214-minute allowance.
        if (ledger.seconds + seconds > 180 * 60) throw new SpeechError("本站今日转写额度已用完，请在下次北京时间 08:00 后重试", 429);
        ledger.seconds += seconds;
        ledger.entries[key] = { state: "pending", retryAt: tomorrow };
        await save(ledger); // Reserve BEFORE sending. A crash never silently resets usage.
        let result: string;
        try {
          const response = await request(`https://api.cloudflare.com/client/v4/accounts/${config.account}/ai/run/${SPEECH_MODEL}`, {
            method: "POST", headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ audio: prepared.audio.toString("base64"), task: "transcribe", vad_filter: true, condition_on_previous_text: false }),
            signal: AbortSignal.timeout(60000), redirect: "error",
          });
          if (response.status === 429 || response.status === 402) {
            ledger.blockedUntil = tomorrow;
            throw new SpeechError("Cloudflare 额度或请求限制已触发，今日暂停新转写", 429);
          }
          if (!response.ok) throw new SpeechError(response.status === 401 || response.status === 403 ? "转写服务授权无效，请联系部署者检查配置" : "转写服务暂时不可用，请稍后再试");
          const body = await response.json();
          if (body.success !== true || typeof body.result?.text !== "string" || body.result.text.length > 30000) throw new SpeechError("转写服务未返回有效文字，请稍后再试");
          result = body.result.text.trim();
        } catch (error) {
          // Failed/uncertain remote calls remain charged. Only an explicit later click retries.
          ledger.entries[key] = { state: "failed", retryAt: ledger.blockedUntil > now ? tomorrow : clock() + 60000 };
          await save(ledger);
          throw error instanceof SpeechError ? error : new SpeechError("转写请求未完成，请稍后重试");
        }
        ledger.entries[key] = { state: "done", text: result };
        await save(ledger);
        return result;
      });
      pending.set(id, work); tail = work.catch(() => undefined);
      void work.finally(() => pending.delete(id)).catch(() => undefined);
      return work;
    },
  };
}
