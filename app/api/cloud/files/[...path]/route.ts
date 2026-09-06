import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { NextResponse } from "next/server";
import { parseByteRange } from "../../../../byte-range";
import { currentIdentityId } from "../../../identity/session";
import { resolveCloudPath } from "../../store";

export const runtime = "nodejs";

const contentTypes: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".pdf": "application/pdf", ".txt": "text/plain; charset=utf-8", ".md": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".webm": "video/webm",
  ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".wav": "audio/wav", ".avif": "image/avif", ".bmp": "image/bmp",
};

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  if (!(await currentIdentityId())) return new NextResponse("Unauthorized", { status: 401 });
  try {
    const parts = (await context.params).path;
    const relativePath = parts.join("/");
    const resolved = resolveCloudPath(relativePath).resolved;
    const details = await stat(resolved);
    if (!details.isFile()) throw new Error("Not a file");
    const name = path.basename(resolved).replace(/^__chat_[0-9a-f-]{36}__/i, "");
    const encodedName = encodeURIComponent(name).replace(/['()]/g, escape);
    const range = parseByteRange(_request.headers.get("range"), details.size);
    if (range === "invalid") return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${details.size}` } });
    const stream = Readable.toWeb(createReadStream(resolved, range || undefined)) as ReadableStream;
    return new NextResponse(stream, { status: range ? 206 : 200, headers: {
      "Content-Type": contentTypes[path.extname(name).toLowerCase()] || "application/octet-stream",
      "Content-Length": String(range ? range.end - range.start + 1 : details.size),
      "Accept-Ranges": "bytes",
      ...(range ? { "Content-Range": `bytes ${range.start}-${range.end}/${details.size}` } : {}),
      "Content-Disposition": `inline; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
