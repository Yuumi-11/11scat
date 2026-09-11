import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { currentIdentityId } from "../../../identity/session";
import { getUser } from "../../../identity/store";
import { parseByteRange } from "../../../../byte-range";
import { taskAttachments } from "./service";
import { TaskAttachmentError } from "./store";

export const runtime = 'nodejs';
const types: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif', '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.aac': 'audio/aac' };
const failure = (error: unknown) => NextResponse.json({ error: error instanceof TaskAttachmentError ? error.message : '附件暂时无法读取，请重试' }, { status: error instanceof TaskAttachmentError ? error.status : (error as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 503 });
async function identity() { const id = await currentIdentityId(); return id && await getUser(id) ? id : null; }
export async function POST(request: NextRequest) {
  const actor = await identity(); if (!actor) return new NextResponse('Unauthorized', { status: 401 });
  const origin = request.headers.get('origin');
  try { if (origin && new URL(origin).host !== request.headers.get('host')) return new NextResponse('Forbidden', { status: 403 }); }
  catch { return new NextResponse('Forbidden', { status: 403 }); }
  if (!request.body) return NextResponse.json({ error: '请选择附件' }, { status: 400 });
  if (Number(request.headers.get('content-length')) > 20 * 1024 * 1024) return NextResponse.json({ error: '单个附件不能超过20 MB' }, { status: 413 });
  try {
    const name = decodeURIComponent(request.headers.get('x-file-name') || 'file');
    const item = await taskAttachments.stage(actor, request.nextUrl.searchParams.get('task') || '', name, request.body);
    return NextResponse.json({ item }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return failure(error); }
}
export async function GET(request: NextRequest) {
  const actor = await identity(); if (!actor) return new NextResponse('Unauthorized', { status: 401 });
  try {
    const relative = request.nextUrl.searchParams.get('path') || '', name = path.posix.basename(relative);
    const resolved = await taskAttachments.readable(actor, relative), info = await stat(resolved);
    const range = info.size ? parseByteRange(request.headers.get('range'), info.size) : null;
    if (range === 'invalid') return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${info.size}` } });
    const extension = path.extname(name).toLowerCase();
    const text = /^\.(txt|md|json|csv|log|yaml|yml|xml|html|css|js|ts|py|cpp|c|h|java)$/.test(extension);
    const stream = info.size ? Readable.toWeb(createReadStream(resolved, range || undefined)) as ReadableStream : null;
    return new NextResponse(stream, { status: range ? 206 : 200, headers: {
      'Content-Type': text ? 'text/plain; charset=utf-8' : types[extension] || 'application/octet-stream',
      'Content-Length': String(range ? range.end - range.start + 1 : info.size), 'Accept-Ranges': 'bytes',
      ...(range ? { 'Content-Range': `bytes ${range.start}-${range.end}/${info.size}` } : {}),
      'Content-Disposition': `${request.nextUrl.searchParams.has('download') ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(name).replace(/['()]/g, escape)}`,
      // Chromium's native PDF viewer cannot load a sandboxed response.
      'Cache-Control': 'private, no-store', 'Content-Security-Policy': extension === '.pdf' ? "default-src 'none'" : "sandbox; default-src 'none'", 'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) { return failure(error); }
}
