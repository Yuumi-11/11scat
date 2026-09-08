import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { NextResponse } from "next/server";
import { parseByteRange } from "../../../../byte-range";
import { currentIdentityId } from "../../../identity/session";
import { compatibleAudio } from "../../../../audio-playback";

export const runtime = "nodejs";

const dataDirectory = process.env.DATA_DIR
  || (process.env.NODE_ENV === "production" ? "/data" : path.join(process.cwd(), ".data"));
const fileDirectory = path.join(dataDirectory, "chat-files");

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await currentIdentityId())) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  try {
    const metadata = JSON.parse(await readFile(path.join(fileDirectory, `${id}.json`), "utf8")) as { name?: unknown; mimeType?: unknown };
    let filePath = path.join(fileDirectory, `${id}.bin`);
    let mimeType = typeof metadata.mimeType === "string" ? metadata.mimeType : "application/octet-stream";
    if (new URL(_request.url).searchParams.get("playback") === "1" && mimeType.startsWith("audio/")) {
      try {
        filePath = await compatibleAudio(filePath);
        mimeType = "audio/mp4";
      } catch {
        return NextResponse.json({ error: "语音处理失败，请稍后重试" }, { status: 503, headers: { "Retry-After": "3", "Cache-Control": "no-store" } });
      }
    }
    const fileStat = await stat(filePath);
    const name = typeof metadata.name === "string" ? metadata.name : "file";
    const encodedName = encodeURIComponent(name).replace(/['()]/g, escape);
    const range = parseByteRange(_request.headers.get("range"), fileStat.size);
    if (range === "invalid") return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${fileStat.size}` } });
    const stream = Readable.toWeb(createReadStream(filePath, range || undefined)) as ReadableStream;
    return new NextResponse(stream, { status: range ? 206 : 200, headers: {
      "Content-Type": mimeType,
      "Content-Length": String(range ? range.end - range.start + 1 : fileStat.size),
      "Accept-Ranges": "bytes",
      ...(range ? { "Content-Range": `bytes ${range.start}-${range.end}/${fileStat.size}` } : {}),
      "Content-Disposition": `inline; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
