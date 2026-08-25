import { NextResponse } from "next/server";

export function GET() {
  const username = process.env.TURN_USERNAME?.trim();
  const credential = process.env.TURN_CREDENTIAL?.trim();
  const turnUrls = process.env.TURN_URLS
    ?.split(",")
    .map((url) => url.trim())
    .filter(Boolean);

  const iceServers: RTCIceServer[] = [
    { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] },
  ];

  if (username && credential && turnUrls?.length) {
    iceServers.push({ urls: turnUrls, username, credential });
  }

  const peerPath = process.env.PEER_SERVER_PATH?.trim();

  return NextResponse.json({
    iceServers,
    peerServer: peerPath ? { path: peerPath, key: "peerjs" } : null,
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
