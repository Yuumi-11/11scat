import { NextResponse } from "next/server";
import { accessToken } from "../store";
import { currentIdentityId } from "../../identity/session";

export async function POST(request: Request) {
  const identityId = await currentIdentityId();
  if (!identityId) return new NextResponse("Unauthorized", { status: 401 });
  const body = await request.json().catch(() => ({}));
  if ([body.identityId, body.targetIdentityId, body.ownerId].some((id) => id !== undefined && id !== identityId)) {
    return new NextResponse("Cannot modify another member's task", { status: 403 });
  }
  const token = await accessToken();
  if (!token) return new NextResponse("Not connected", { status: 401 });
  if (typeof body.projectId !== "string" || typeof body.taskId !== "string") return new NextResponse("Invalid task", { status: 400 });
  const response = await fetch(`https://api.dida365.com/open/v1/project/${encodeURIComponent(body.projectId)}/task/${encodeURIComponent(body.taskId)}/complete`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
  });
  return new NextResponse(null, { status: response.ok ? 204 : response.status });
}
