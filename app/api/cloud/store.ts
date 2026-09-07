import { copyFile, link, mkdir, readFile, readdir, stat, lstat, rm } from "node:fs/promises";
import path from "node:path";

export const cloudRoot = path.join(
  process.env.DATA_DIR || (process.env.NODE_ENV === "production" ? "/data" : path.join(process.cwd(), ".data")),
  "cloud-drive",
);

const defaultLimitBytes = 5 * 1024 * 1024 * 1024;
const configuredLimit = Number(process.env.CLOUD_DRIVE_LIMIT_BYTES);
export const cloudLimitBytes = Number.isSafeInteger(configuredLimit) && configuredLimit > 0
  ? configuredLimit
  : defaultLimitBytes;
export const cloudWarningBytes = Math.floor(cloudLimitBytes * 0.9);

export class CloudCapacityError extends Error {
  status = 507;
  constructor(message = "云盘容量已达到 90%，请清理空间后再上传") {
    super(message);
  }
}

export function sanitizeFileName(value: string, fallback = "file") {
  const cleaned = value
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "_")
    .replace(/^\.+$/, "_")
    .trim()
    .slice(0, 180);
  return cleaned || fallback;
}

export function normalizeCloudPath(value: string | null | undefined) {
  if (!value) return "";
  const normalized = value.replace(/\\/g, "/").split("/")
    .filter(Boolean)
    .map((part) => sanitizeFileName(part, "_"))
    .join("/");
  return normalized.slice(0, 800);
}

export function resolveCloudPath(relativePath = "") {
  const normalized = normalizeCloudPath(relativePath);
  const resolved = path.resolve(cloudRoot, normalized);
  const rootPrefix = `${path.resolve(cloudRoot)}${path.sep}`;
  if (resolved !== path.resolve(cloudRoot) && !resolved.startsWith(rootPrefix)) throw new Error("Invalid cloud path");
  return { normalized, resolved };
}

export async function ensureCloudFolders() {
  // Content-specific folders are created when saving there, not when listing the drive.
  await mkdir(cloudRoot, { recursive: true, mode: 0o700 });
}

async function directoryUsage(directory: string): Promise<number> {
  let total = 0;
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch { return 0; }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await directoryUsage(entryPath);
    else if (entry.isFile()) total += (await stat(entryPath)).size;
  }
  return total;
}

export async function cloudStatus() {
  await ensureCloudFolders();
  const usedBytes = await directoryUsage(cloudRoot);
  return {
    usedBytes,
    limitBytes: cloudLimitBytes,
    warningBytes: cloudWarningBytes,
    warning: usedBytes >= cloudWarningBytes,
    percent: Math.min(100, Math.round((usedBytes / cloudLimitBytes) * 1000) / 10),
  };
}

export async function assertCloudCapacity(additionalBytes: number) {
  const status = await cloudStatus();
  if (status.warning || additionalBytes < 0 || status.usedBytes + additionalBytes > cloudWarningBytes) {
    throw new CloudCapacityError();
  }
  return status;
}

const importedPrefix = /^__chat_[0-9a-f-]{36}__(.+)$/i;

export async function listCloudFolder(relativePath: string) {
  await ensureCloudFolders();
  const { normalized, resolved } = resolveCloudPath(relativePath);
  const entries = await readdir(resolved, { withFileTypes: true });
  const items = await Promise.all(entries.filter((entry) => !entry.name.startsWith(".")).map(async (entry) => {
    const itemPath = normalized ? `${normalized}/${entry.name}` : entry.name;
    const details = await stat(path.join(resolved, entry.name));
    const imported = entry.name.match(importedPrefix);
    return {
      name: imported?.[1] || entry.name,
      path: itemPath,
      kind: entry.isDirectory() ? "folder" as const : "file" as const,
      size: entry.isFile() ? details.size : 0,
      updatedAt: details.mtimeMs,
    };
  }));
  items.sort((left, right) => Number(left.kind === "file") - Number(right.kind === "file") || left.name.localeCompare(right.name, "zh-CN"));
  return { path: normalized, items, status: await cloudStatus() };
}

export async function createCloudFolder(parentPath: string, name: string) {
  await ensureCloudFolders();
  const parent = resolveCloudPath(parentPath);
  const folderName = sanitizeFileName(name, "新建文件夹");
  const destination = path.join(parent.resolved, folderName);
  await mkdir(destination, { mode: 0o700 });
  return parent.normalized ? `${parent.normalized}/${folderName}` : folderName;
}

async function availableDestination(directory: string, fileName: string) {
  const extension = path.extname(fileName);
  const stem = fileName.slice(0, fileName.length - extension.length);
  for (let suffix = 0; suffix < 10000; suffix += 1) {
    const candidate = suffix ? `${stem} (${suffix})${extension}` : fileName;
    try {
      await stat(path.join(directory, candidate));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return path.join(directory, candidate);
      throw error;
    }
  }
  return path.join(directory, `${crypto.randomUUID()}-${fileName}`);
}

export async function importChatAttachment(id: string, sourcePath: string, name: string, size: number, target: "chat" | "chat/pics" | "video") {
  await ensureCloudFolders();
  const destinationDirectory = path.join(cloudRoot, ...target.split("/"));
  await mkdir(destinationDirectory, { recursive: true, mode: 0o700 });
  const storedName = `__chat_${id}__${sanitizeFileName(name)}`;
  const destination = path.join(destinationDirectory, storedName);
  try {
    await stat(destination);
    return target ? `${target}/${storedName}` : storedName;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await assertCloudCapacity(size);
  try { await link(sourcePath, destination); } catch { await copyFile(sourcePath, destination); }
  return `${target}/${storedName}`;
}

export async function autoImportChatFile(id: string, sourcePath: string, name: string, size: number) {
  try {
    return { path: await importChatAttachment(id, sourcePath, name, size, "chat"), warning: "" };
  } catch (error) {
    if (error instanceof CloudCapacityError) return { path: "", warning: error.message };
    return { path: "", warning: "文件已发送，但自动保存到云盘失败" };
  }
}

export async function readChatAttachmentMetadata(id: string) {
  const dataRoot = process.env.DATA_DIR || (process.env.NODE_ENV === "production" ? "/data" : path.join(process.cwd(), ".data"));
  const directory = path.join(dataRoot, "chat-files");
  const metadata = JSON.parse(await readFile(path.join(directory, `${id}.json`), "utf8")) as {
    name?: unknown; size?: unknown; mimeType?: unknown; kind?: unknown;
  };
  if ((metadata.kind !== "image" && metadata.kind !== "audio") || typeof metadata.name !== "string" || typeof metadata.size !== "number") {
    throw new Error("仅支持手动保存聊天图片或语音");
  }
  return { sourcePath: path.join(directory, `${id}.bin`), name: metadata.name, size: metadata.size, kind: metadata.kind };
}

export { availableDestination };

export async function deleteCloudItem(relativePath: string) {
  if (!relativePath || relativePath.length > 800 || relativePath.includes("\\") || relativePath.startsWith("/")
    || relativePath.split("/").some(part => !part || part === "." || part === ".." || part.startsWith(".") || /[:\u0000-\u001f]/.test(part))) throw new Error("INVALID_PATH");
  const { normalized, resolved } = resolveCloudPath(relativePath);
  if (normalized !== relativePath || resolved === path.resolve(cloudRoot)) throw new Error("INVALID_PATH");
  // Never follow a symlink outside the drive, including symlinked parent folders.
  let cursor = cloudRoot;
  for (const part of ["", ...relativePath.split("/")]) {
    if (part) cursor = path.join(cursor, part);
    try { if ((await lstat(cursor)).isSymbolicLink()) throw new Error("INVALID_PATH"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  }
  await rm(resolved, { recursive: true, force: true });
}
