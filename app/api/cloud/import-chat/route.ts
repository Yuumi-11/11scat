import { NextRequest, NextResponse } from "next/server";
import { currentIdentityId } from "../../identity/session";
import { CloudCapacityError, importChatAttachment, readChatAttachmentMetadata } from "../store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!(await currentIdentityId())) return new NextResponse("Unauthorized", { status: 401 });
  const body = await request.json().catch(() => null) as { attachmentId?: unknown } | null;
  if (!body || typeof body.attachmentId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.attachmentId)) {
    return NextResponse.json({ error: "图片不存在" }, { status: 400 });
  }
  try {
    const item = await readChatAttachmentMetadata(body.attachmentId);
    const path = await importChatAttachment(body.attachmentId, item.sourcePath, item.name, item.size, "chat/pics");
    return NextResponse.json({ path }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof CloudCapacityError ? error.message : "图片上传到云盘失败" }, { status: error instanceof CloudCapacityError ? 507 : 404 });
  }
}
