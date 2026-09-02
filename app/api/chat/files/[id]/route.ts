import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { NextResponse } from "next/server";
import { currentIdentityId } from "../../../identity/session";

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
    const filePath = path.join(fileDirectory, `${id}.bin`);
    const fileStat = await stat(filePath);
    const name = typeof metadata.name === "string" ? metadata.name : "file";
    const mimeType = typeof metadata.mimeType === "string" ? metadata.mimeType : "application/octet-stream";
    const encodedName = encodeURIComponent(name).replace(/['()]/g, escape);
    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
    return new NextResponse(stream, { headers: {
      "Content-Type": mimeType,
      "Content-Length": String(fileStat.size),
      "Content-Disposition": `inline; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
