import { NextResponse } from "next/server";
import { accessToken } from "../store";

export async function POST(request: Request) {
  const token = await accessToken();
  if (!token) return new NextResponse("Not connected", { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (typeof body.projectId !== "string" || typeof body.taskId !== "string") return new NextResponse("Invalid task", { status: 400 });
  const response = await fetch(`https://api.dida365.com/open/v1/project/${encodeURIComponent(body.projectId)}/task/${encodeURIComponent(body.taskId)}/complete`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
  });
  return new NextResponse(null, { status: response.ok ? 204 : response.status });
}
