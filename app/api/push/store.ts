import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import webPush from "web-push";

export type StoredPushSubscription = {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
  identityId: string;
  deviceId: string;
  updatedAt: number;
};

type PushStore = { version: 1; subscriptions: StoredPushSubscription[] };
const dataDirectory = process.env.DATA_DIR
  || (process.env.NODE_ENV === "production" ? "/data" : path.join(process.cwd(), ".data"));
const storePath = path.join(dataDirectory, "push-subscriptions.json");
let mutationQueue: Promise<void> = Promise.resolve();

async function readStore(): Promise<PushStore> {
  try {
    const parsed = JSON.parse(await readFile(storePath, "utf8")) as Partial<PushStore>;
    return { version: 1, subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { version: 1, subscriptions: [] };
  }
}

async function writeStore(store: PushStore) {
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${storePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(store)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, storePath);
}

async function mutate(operation: (store: PushStore) => void | Promise<void>) {
  const next = mutationQueue.then(async () => {
    const store = await readStore();
    await operation(store);
    await writeStore(store);
  });
  mutationQueue = next.catch(() => undefined);
  return next;
}

export function savePushSubscription(subscription: StoredPushSubscription) {
  return mutate((store) => {
    const index = store.subscriptions.findIndex((item) => item.endpoint === subscription.endpoint);
    if (index >= 0) store.subscriptions[index] = subscription;
    else store.subscriptions.push(subscription);
    store.subscriptions = store.subscriptions.filter((item) => item.updatedAt >= Date.now() - 180 * 24 * 60 * 60 * 1000);
  });
}

export function removePushSubscription(endpoint: string) {
  return mutate((store) => { store.subscriptions = store.subscriptions.filter((item) => item.endpoint !== endpoint); });
}

export async function sendChatPush(message: { sender: string; body: string; attachment?: { kind: string; name: string } }, senderDeviceId: string) {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return;
  webPush.setVapidDetails(process.env.VAPID_SUBJECT || "https://study.11scat.xyz", publicKey, privateKey);
  await mutationQueue;
  const store = await readStore();
  const payload = JSON.stringify({
    title: `${message.sender} 发来消息`,
    body: message.body || (message.attachment?.kind === "image" ? "发送了一张图片" : `发送了文件：${message.attachment?.name || "文件"}`),
    url: "/",
  });
  const expired = new Set<string>();
  await Promise.allSettled(store.subscriptions.filter((item) => item.deviceId !== senderDeviceId).map(async (item) => {
    try {
      await webPush.sendNotification({ endpoint: item.endpoint, expirationTime: item.expirationTime, keys: item.keys }, payload, { TTL: 60 * 60, urgency: "high", timeout: 10_000 });
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) expired.add(item.endpoint);
    }
  }));
  if (expired.size) await mutate((current) => { current.subscriptions = current.subscriptions.filter((item) => !expired.has(item.endpoint)); });
}
