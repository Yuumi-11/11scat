import { mkdir, open, rename, rm } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { currentIdentityId } from "../../identity/session";
import { assertCloudCapacity, availableDestination, CloudCapacityError, ensureCloudFolders, resolveCloudPath, sanitizeFileName, deleteCloudItem } from "../store";

export const runtime = "nodejs";

export async function DELETE(request: NextRequest) {
  if (!(await currentIdentityId())) return new NextResponse("Unauthorized", { status: 401 });
  const origin = request.headers.get("origin");
  if (origin) {
    try { if (new URL(origin).host !== request.headers.get("host")) return new NextResponse("Forbidden", { status: 403 }); }
    catch { return new NextResponse("Forbidden", { status: 403 }); }
  }
  const body = await request.json().catch(() => ({}));
  if (typeof body.path !== "string" || body.confirmed !== true) return NextResponse.json({ error: "请确认要删除的文件或文件夹" }, { status: 400 });
  try {
    await deleteCloudItem(body.path);
    return NextResponse.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message === "INVALID_PATH" ? "不能删除此路径" : "删除失败，请重试" }, { status: (error as Error).message === "INVALID_PATH" ? 400 : 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await currentIdentityId())) return new NextResponse("Unauthorized", { status: 401 });
  if (!request.body) return NextResponse.json({ error: "请选择文件" }, { status: 400 });
  let name = "file";
  try { name = decodeURIComponent(request.headers.get("x-file-name") || "file"); } catch { /* keep fallback */ }
  name = sanitizeFileName(name);
  const contentLength = Number(request.headers.get("content-length") || 0);
  try { await assertCloudCapacity(Number.isFinite(contentLength) ? contentLength : 0); } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: error instanceof CloudCapacityError ? 507 : 500 });
  }
  await ensureCloudFolders();
  const parent = resolveCloudPath(request.nextUrl.searchParams.get("path") || "");
  await mkdir(parent.resolved, { recursive: true, mode: 0o700 });
  const temporaryPath = path.join(parent.resolved, `.${crypto.randomUUID()}.upload`);
  const handle = await open(temporaryPath, "wx", 0o600);
  let size = 0;
  try {
    const reader = request.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      size += value.byteLength;
      await assertCloudCapacity(size);
      await handle.write(value);
    }
    await handle.close();
    const destination = await availableDestination(parent.resolved, name);
    await rename(temporaryPath, destination);
    const relative = parent.normalized ? `${parent.normalized}/${path.basename(destination)}` : path.basename(destination);
    return NextResponse.json({ item: { name: path.basename(destination), path: relative, kind: "file", size } }, { status: 201 });
  } catch (error) {
    await handle.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    return NextResponse.json({ error: error instanceof CloudCapacityError ? error.message : "上传失败，请重试" }, { status: error instanceof CloudCapacityError ? 507 : 500 });
  }
}
