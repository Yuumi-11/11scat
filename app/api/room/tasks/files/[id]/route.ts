import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { currentIdentityId } from "../../../../identity/session";
import { store, collaborationDirectory } from "../../service";
import { CollaborationError } from "../../store";
import { metadata } from "../storage";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await currentIdentityId();
  if (!actor) return new NextResponse(null, { status: 401 });
  try {
    const { id } = await context.params, file = await metadata(collaborationDirectory, id);
    await store.attachmentAccess(actor, file.workflowId, false, file);
    const bytes = await readFile(path.join(collaborationDirectory, "workflow-files", id));
    return new NextResponse(bytes, { headers: { "Content-Type": "application/octet-stream", "Content-Length": String(bytes.length), "Content-Disposition": `attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g, value => `%${value.charCodeAt(0).toString(16)}`)}`, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof CollaborationError ? error.message : "附件暂时无法读取" }, { status: error instanceof CollaborationError ? error.status : 503 }); }
}
