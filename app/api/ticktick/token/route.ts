import { NextResponse } from "next/server";
import { encryptToken } from "../crypto";

const COOKIE = "tt_access";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) return new NextResponse("Missing token", { status: 400 });

  const check = await fetch("https://api.dida365.com/open/v1/project", {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
  });
  if (!check.ok) return new NextResponse("Invalid token", { status: 401 });
  const projects = await check.json().catch(() => null) as { id?: unknown; closed?: boolean }[] | null;
  if (!Array.isArray(projects)) return new NextResponse("Task read failed", { status: 502 });
  const activeProjectIds = projects
    .filter((project) => !project.closed && typeof project.id === "string")
    .map((project) => project.id as string);
  const taskChecks = await Promise.all(activeProjectIds.map((projectId) => fetch(
    `https://api.dida365.com/open/v1/project/${encodeURIComponent(projectId)}/data`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  )));
  if (taskChecks.some((response) => !response.ok)) {
    return new NextResponse("Task read failed", { status: 502 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE, encryptToken(token), {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
