import { NextResponse } from "next/server";
import { accessToken } from "../store";
import { tickFetch, inboxResponseShape } from "../client";

export async function GET() {
  const token = await accessToken();
  if (!token) return NextResponse.json({ error: "请先登录并连接滴答清单" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const checks = await Promise.all(["/project/inbox/data", "/project/inbox"].map(async endpoint => {
    try {
      const response = await tickFetch(endpoint, token);
      const data = await response.json().catch(() => undefined);
      return { endpoint, status: response.status, shape: inboxResponseShape(data) };
    } catch { return { endpoint, status: "network-error" }; }
  }));
  return NextResponse.json({ version: 1, checks }, { headers: { "Cache-Control": "private, no-store" } });
}
