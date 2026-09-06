import { mkdir, open, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { currentIdentityId } from "../../identity/session";
import { autoImportChatFile } from "../../cloud/store";

export const runtime = "nodejs";

const dataDirectory = process.env.DATA_DIR
  || (process.env.NODE_ENV === "production" ? "/data" : path.join(process.cwd(), ".data"));
const fileDirectory = path.join(dataDirectory, "chat-files");

export async function POST(request: NextRequest) {
  if (!(await currentIdentityId())) return new NextResponse("Unauthorized", { status: 401 });
  if (!request.body) return NextResponse.json({ error: "请选择文件" }, { status: 400 });
  let name = "file";
  try { name = decodeURIComponent(request.headers.get("x-file-name") || "file"); } catch { /* keep fallback */ }
  name = name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 255) || "file";
  const mimeType = (request.headers.get("content-type") || "application/octet-stream").slice(0, 255);
  const id = crypto.randomUUID();
  await mkdir(fileDirectory, { recursive: true, mode: 0o700 });
  const temporaryPath = path.join(fileDirectory, `${id}.${process.pid}.tmp`);
  const finalPath = path.join(fileDirectory, `${id}.bin`);
  const handle = await open(temporaryPath, "wx", 0o600);
  let size = 0;
  try {
    const reader = request.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.byteLength) {
        await handle.write(value);
        size += value.byteLength;
      }
    }
  } catch {
    await handle.close();
    return NextResponse.json({ error: "上传中断，请重试" }, { status: 400 });
  }
  await handle.close();
  await rename(temporaryPath, finalPath);
  const kind = mimeType.startsWith("image/") ? "image" : mimeType.startsWith("audio/") ? "audio" : "file";
  await writeFile(path.join(fileDirectory, `${id}.json`), JSON.stringify({ id, name, size, mimeType, kind }), { encoding: "utf8", mode: 0o600 });
  const cloud = kind === "file" ? await autoImportChatFile(id, finalPath, name, size) : null;
  return NextResponse.json({
    attachment: { id, url: `/api/chat/files/${id}`, name, size, mimeType, kind },
    cloudWarning: cloud?.warning || undefined,
  }, { status: 201 });
}
