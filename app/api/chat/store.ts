import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type StoredAttachment = {
  id: string;
  url: string;
  name: string;
  size: number;
  mimeType: string;
  kind: "image" | "file";
};

export type StoredQuote = { id: string; sender: string; body: string };

export type StoredMessage = {
  id: string;
  body: string;
  attachment?: StoredAttachment;
  replyTo?: StoredQuote;
  identityId: string;
  sender: string;
  time: string;
  createdAt: number;
  recalled?: boolean;
};

type ChatStore = { version: 1; messages: StoredMessage[] };

const dataDirectory = process.env.DATA_DIR
  || (process.env.NODE_ENV === "production" ? "/data" : path.join(process.cwd(), ".data"));
const storePath = path.join(dataDirectory, "chat-messages.json");
let mutationQueue: Promise<void> = Promise.resolve();

async function readStore(): Promise<ChatStore> {
  try {
    const parsed = JSON.parse(await readFile(storePath, "utf8")) as Partial<ChatStore>;
    return { version: 1, messages: Array.isArray(parsed.messages) ? parsed.messages : [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { version: 1, messages: [] };
  }
}

async function writeStore(store: ChatStore) {
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${storePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(store)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, storePath);
}

async function mutate<T>(operation: (store: ChatStore) => Promise<T> | T): Promise<T> {
  let resolveResult!: (value: T) => void;
  let rejectResult!: (reason?: unknown) => void;
  const result = new Promise<T>((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
  mutationQueue = mutationQueue.then(async () => {
    try {
      const store = await readStore();
      const value = await operation(store);
      await writeStore(store);
      resolveResult(value);
    } catch (error) {
      rejectResult(error);
    }
  });
  await mutationQueue.catch(() => undefined);
  return result;
}

export async function saveMessage(message: StoredMessage): Promise<StoredMessage> {
  return mutate((store) => {
    const existing = store.messages.find((item) => item.id === message.id);
    if (existing) return existing;
    store.messages.push(message);
    return message;
  });
}

export async function recallMessage(id: string, identityId: string): Promise<boolean> {
  return mutate((store) => {
    const message = store.messages.find((item) => item.id === id && item.identityId === identityId);
    if (!message || message.recalled) return false;
    message.recalled = true;
    return true;
  });
}

export async function listMessages(before: number | null, limit: number) {
  const store = await readStore();
  const visible = store.messages
    .filter((message) => !message.recalled && (before === null || message.createdAt < before))
    .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
  const start = Math.max(0, visible.length - limit);
  const messages = visible.slice(start);
  return { messages, nextCursor: start > 0 && messages[0] ? String(messages[0].createdAt) : null };
}
