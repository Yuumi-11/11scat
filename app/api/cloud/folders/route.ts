import { NextRequest, NextResponse } from "next/server";
import { currentIdentityId } from "../../identity/session";
import { createCloudFolder } from "../store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!(await currentIdentityId())) return new NextResponse("Unauthorized", { status: 401 });
  const body = await request.json().catch(() => null) as { path?: unknown; name?: unknown } | null;
  if (!body || typeof body.path !== "string" || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "请输入文件夹名称" }, { status: 400 });
  }
  try {
    const path = await createCloudFolder(body.path, body.name);
    return NextResponse.json({ path }, { status: 201 });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return NextResponse.json({ error: code === "EEXIST" ? "同名文件夹已经存在" : "创建文件夹失败" }, { status: code === "EEXIST" ? 409 : 500 });
  }
}
