import { NextRequest, NextResponse } from "next/server";
import { currentIdentityId } from "../identity/session";
import { listCloudFolder } from "./store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await currentIdentityId())) return new NextResponse("Unauthorized", { status: 401 });
  try {
    return NextResponse.json(await listCloudFolder(request.nextUrl.searchParams.get("path") || ""));
  } catch {
    return NextResponse.json({ error: "云盘目录不存在" }, { status: 404 });
  }
}
