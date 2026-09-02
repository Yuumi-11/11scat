import { NextResponse } from "next/server";

type RoomParticipant = {
  peerId: string;
  deviceId: string;
  name: string;
  seenAt: number;
};

type RoomPresenceGlobal = typeof globalThis & {
  __studyRoomPresence?: Map<string, RoomParticipant>;
};

const presenceGlobal = globalThis as RoomPresenceGlobal;
const participants = presenceGlobal.__studyRoomPresence ??= new Map<string, RoomParticipant>();
const presenceLifetime = 60_000;
const peerPattern = /^[A-Za-z0-9_-]{1,64}$/;
const devicePattern = /^[A-Za-z0-9_-]{1,80}$/;

function activeParticipants(now = Date.now()) {
  for (const [deviceId, participant] of participants) {
    if (now - participant.seenAt > presenceLifetime) participants.delete(deviceId);
  }
  return [...participants.values()].map(({ peerId, deviceId, name }) => ({ peerId, deviceId, name }));
}

export function GET() {
  return NextResponse.json({ participants: activeParticipants() }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const peerId = typeof body.peerId === "string" ? body.peerId.trim() : "";
  const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 24) : "成员";
  if (!peerPattern.test(peerId) || !devicePattern.test(deviceId)) {
    return new NextResponse("Invalid presence", { status: 400 });
  }

  participants.set(deviceId, { peerId, deviceId, name: name || "成员", seenAt: Date.now() });
  return NextResponse.json({ participants: activeParticipants() }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({}));
  const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
  if (devicePattern.test(deviceId)) participants.delete(deviceId);
  return new NextResponse(null, { status: 204 });
}
