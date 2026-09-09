import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const SPEECH_MODEL = "@cf/openai/whisper-large-v3-turbo";
export class SpeechError extends Error {
  status: number;
  constructor(message: string, status = 503) { super(message); this.status = status; }
}
type Entry = { state: "pending" | "done" | "failed"; text?: string; retryAt?: number };
type Ledger = { version: 1 | 2; entries: Record<string, Entry> };
type Options = {
  directory: string;
  prepare: (id: string) => Promise<{ audio: Buffer; seconds: number }>;
  config: () => { account: string; token: string; freePlan: boolean };
  fetch?: typeof fetch;
  now?: () => number;
};

/** One service per Node process. Cloudflare owns the daily allowance. */
export function createSpeechService(options: Options) {
  let records: Promise<unknown> = Promise.resolve(), preparation: Promise<unknown> = Promise.resolve();
  let active = 0;
  const waiting: Array<() => void> = [], pending = new Map<string, Promise<string>>();
  const clock = options.now || Date.now, request = options.fetch || fetch;
  const file = path.join(options.directory, "transcripts-v1.json");
  function transaction<T>(change: (ledger: Ledger) => T | Promise<T>): Promise<T> {
    const work = records.then(async () => {
      let ledger: Ledger;
      try { ledger = JSON.parse(await readFile(file, "utf8")); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new SpeechError("转写记录暂时无法读取");
        ledger = { version: 2, entries: {} };
      }
      if (![1, 2].includes(ledger.version) || !ledger.entries || typeof ledger.entries !== "object" || Array.isArray(ledger.entries)) throw new SpeechError("转写记录需要维护");
      // Keep v1 transcripts and discard the obsolete local quota and day lockout.
      if (ledger.version === 1) {
        for (const entry of Object.values(ledger.entries)) {
          if (entry.state !== "done") entry.retryAt = Math.min(entry.retryAt || 0, clock() + 60000);
        }
        ledger = { version: 2, entries: ledger.entries };
      }
      const result = await change(ledger);
      await mkdir(options.directory, { recursive: true, mode: 0o700 });
      const temp = `${file}.${randomUUID()}.tmp`;
      await writeFile(temp, JSON.stringify(ledger), { mode: 0o600 });
      await rename(temp, file);
      return result;
    });
    records = work.catch(() => undefined);
    return work;
  }
  async function slot<T>(run: () => Promise<T>): Promise<T> {
    if (active >= 3) await new Promise<void>(resolve => waiting.push(resolve));
    else active++;
    try { return await run(); }
    finally { const next = waiting.shift(); if (next) next(); else active--; }
  }
  function prepare(id: string) {
    const work = preparation.then(() => options.prepare(id));
    preparation = work.catch(() => undefined);
    return work;
  }
  return {
    transcribe(id: string): Promise<string> {
      const existing = pending.get(id); if (existing) return existing;
      if (pending.size >= 6) return Promise.reject(new SpeechError("转写较繁忙，请稍后再试", 429));
      const work = slot(async () => {
        const key = `${SPEECH_MODEL}:${id}`;
        const cached = await transaction(ledger => ledger.entries[key]);
        if (cached?.state === "done") return cached.text || "";
        if (cached?.retryAt && cached.retryAt > clock()) throw new SpeechError("上次转写尚未成功，请稍后再试；已发送的请求不会自动重发", 429);
        const config = options.config();
        if (!/^[a-f0-9]{32}$/i.test(config.account) || !config.token || !config.freePlan) throw new SpeechError("语音转文字尚未连接，请由部署者配置 Cloudflare 免费账户授权");
        const prepared = await prepare(id);
        if (!Number.isFinite(prepared.seconds) || prepared.seconds <= 0 || prepared.seconds > 305 || prepared.audio.length > 4 * 1024 * 1024) throw new SpeechError("这条语音超过转写长度或大小限制", 413);
        await transaction(ledger => { ledger.entries[key] = { state: "pending", retryAt: clock() + 120000 }; });
        let result: string;
        let retryAt = 0;
        try {
          const response = await request(`https://api.cloudflare.com/client/v4/accounts/${config.account}/ai/run/${SPEECH_MODEL}`, {
            method: "POST", headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ audio: prepared.audio.toString("base64"), task: "transcribe", vad_filter: true, condition_on_previous_text: false }),
            signal: AbortSignal.timeout(60000), redirect: "error",
          });
          if (response.status === 429 || response.status === 402) {
            const retry = response.headers.get("retry-after");
            const delay = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : retry ? Date.parse(retry) - clock() : 60000;
            retryAt = clock() + Math.max(1000, Math.min(Number.isFinite(delay) ? delay : 60000, 86400000));
            throw new SpeechError("Cloudflare 免费额度或请求频率限制已触发，请稍后重试；每日额度于北京时间 08:00 重置", 429);
          }
          if (!response.ok) throw new SpeechError(response.status === 401 || response.status === 403 ? "转写服务授权无效，请联系部署者检查配置" : "转写服务暂时不可用，请稍后再试");
          const body = await response.json();
          if (body.success !== true || typeof body.result?.text !== "string" || body.result.text.length > 30000) throw new SpeechError("转写服务未返回有效文字，请稍后再试");
          result = body.result.text.trim();
        } catch (error) {
          await transaction(ledger => { ledger.entries[key] = { state: "failed", retryAt: retryAt || clock() + 60000 }; });
          throw error instanceof SpeechError ? error : new SpeechError("转写请求未完成，请稍后重试");
        }
        await transaction(ledger => { ledger.entries[key] = { state: "done", text: result }; });
        return result;
      });
      pending.set(id, work);
      void work.finally(() => pending.delete(id)).catch(() => undefined);
      return work;
    },
  };
}
