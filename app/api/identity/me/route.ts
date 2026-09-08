import { NextResponse } from "next/server";
import { currentIdentityId } from "../session";
import { getUser, updateUser } from "../store";

export async function GET() {
  const identityId = await currentIdentityId();
  if (!identityId) return new NextResponse("Unauthorized", { status: 401 });
  const user = await getUser(identityId);
  return NextResponse.json({ identityId, nickname: user?.nickname || "", activity: user?.activity || "" });
}

export async function PATCH(request: Request) {
  const identityId = await currentIdentityId();
  if (!identityId) return new NextResponse("Unauthorized", { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.activity !== "string") return new NextResponse("Invalid activity", { status: 400 });
  const user = await updateUser(identityId, (current) => ({
    ...current,
    activity: body.activity.trim().slice(0, 80),
    updatedAt: new Date().toISOString(),
  }));
  return NextResponse.json({ activity: user.activity });
}

export async function POST(request: Request) {
  const identityId = await currentIdentityId();
  if (!identityId) return new NextResponse("Unauthorized", { status: 401 });
  const body = await request.json().catch(() => ({}));
  const nickname = typeof body.nickname === "string" ? body.nickname.trim().slice(0, 24) : "";
  if (!nickname) return new NextResponse("Invalid nickname", { status: 400 });
  const user = await updateUser(identityId, (current) => ({
    ...current,
    nickname: current?.nickname || nickname,
    updatedAt: new Date().toISOString(),
  }));
  return NextResponse.json({ nickname: user.nickname });
}
