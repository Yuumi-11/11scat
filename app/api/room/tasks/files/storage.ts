import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { CollaborationError } from "../store";

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export type FileMetadata = { id: string; workflowId: string; actorId: string; name: string; size: number; createdAt: number };
const shared = globalThis as typeof globalThis & { workflowUploadQueue?: Promise<unknown> };
export async function metadata(directory: string, id: string): Promise<FileMetadata> {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new CollaborationError("附件编号无效", 400);
  try { return JSON.parse(await readFile(path.join(directory, "workflow-files", `${id}.json`), "utf8")); }
  catch { throw new CollaborationError("附件不存在", 404); }
}
export function uploadFile(directory: string, request: Request, workflowId: string, actorId: string, name: string, authorize: () => Promise<unknown>) {
  const work = (shared.workflowUploadQueue || Promise.resolve()).then(async () => {
    await authorize();
    if (!name || name.length > 200 || /[\x00-\x1f\x7f/\\]/.test(name)) throw new CollaborationError("附件名称无效", 400);
    const length = request.headers.get("content-length");
    if (length && Number(length) > MAX_FILE_BYTES) throw new CollaborationError("每个附件最多 20 MB", 413);
    if (!request.body) throw new CollaborationError("请选择附件", 400);
    const folder = path.join(directory, "workflow-files");
    await mkdir(folder, { recursive: true, mode: 0o700 });
    const records = await Promise.all((await readdir(folder)).filter(file => file.endsWith(".json")).map(file => metadata(directory, file.slice(0, -5))));
    const roomSize = records.reduce((sum, file) => sum + file.size, 0);
    const workflowSize = records.filter(file => file.workflowId === workflowId).reduce((sum, file) => sum + file.size, 0);
    const allowance = Math.min(MAX_FILE_BYTES, 1024 * 1024 * 1024 - roomSize, 100 * 1024 * 1024 - workflowSize);
    if (allowance <= 0) throw new CollaborationError("附件容量已达上限，请联系管理员整理", 413);
    const id = randomUUID(), temp = path.join(folder, `${id}.tmp`), binary = path.join(folder, id);
    const handle = await open(temp, "wx", 0o600), reader = request.body.getReader();
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > allowance) throw new CollaborationError("附件超过容量限制：单文件 20 MB、每流程 100 MB", 413);
        await handle.writeFile(chunk.value);
      }
      await authorize();
      await handle.close(); await rename(temp, binary);
      const file: FileMetadata = { id, workflowId, actorId, name, size, createdAt: Date.now() };
      const record = await open(path.join(folder, `${id}.json`), "wx", 0o600);
      try { await record.writeFile(JSON.stringify(file)); } finally { await record.close(); }
      return { id, name, size, url: `/api/room/tasks/files/${id}` };
    } catch (error) {
      await reader.cancel().catch(() => undefined); await handle.close().catch(() => undefined);
      await Promise.all([temp, binary, path.join(folder, `${id}.json`)].map(file => unlink(file).catch(() => undefined)));
      throw error;
    } finally { reader.releaseLock(); }
  });
  shared.workflowUploadQueue = work.catch(() => undefined);
  return work;
}
