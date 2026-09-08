import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type UserRecord = {
  nickname?: string;
  activity?: string;
  ticktickToken?: string;
  updatedAt: string;
};

type IdentityStore = {
  version: 1;
  users: Record<string, UserRecord>;
};

const dataDirectory = process.env.DATA_DIR
  || (process.env.NODE_ENV === "production" ? "/data" : path.join(process.cwd(), ".data"));
const storePath = path.join(dataDirectory, "identities.json");
let writeQueue: Promise<void> = Promise.resolve();

const emptyStore = (): IdentityStore => ({ version: 1, users: {} });

async function readStore(): Promise<IdentityStore> {
  try {
    const parsed = JSON.parse(await readFile(storePath, "utf8")) as Partial<IdentityStore>;
    if (parsed.version !== 1 || !parsed.users || typeof parsed.users !== "object") return emptyStore();
    return { version: 1, users: parsed.users };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyStore();
    throw error;
  }
}

async function writeStore(store: IdentityStore): Promise<void> {
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${storePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, storePath);
}

export async function getUser(identityId: string): Promise<UserRecord | null> {
  await writeQueue;
  return (await readStore()).users[identityId] || null;
}

export async function listRoomMembers() {
  await writeQueue;
  return Object.entries((await readStore()).users).map(([id, user]) => ({ id, name: user.nickname || "成员" }));
}

export function updateUser(identityId: string, update: (current: UserRecord | null) => UserRecord): Promise<UserRecord> {
  let result: UserRecord;
  const operation = writeQueue.then(async () => {
    const store = await readStore();
    result = update(store.users[identityId] || null);
    store.users[identityId] = result;
    await writeStore(store);
  });
  writeQueue = operation.catch(() => undefined);
  return operation.then(() => result!);
}
