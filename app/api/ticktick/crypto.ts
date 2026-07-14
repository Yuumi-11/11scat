import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(): Buffer {
  const secret = process.env.TICKTICK_COOKIE_SECRET || process.env.SITE_PASSWORD;
  if (!secret) throw new Error("TickTick cookie encryption is not configured");
  return createHash("sha256").update(`11scat-ticktick:${secret}`).digest();
}

export function encryptToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function decryptToken(payload: string): string {
  const value = Buffer.from(payload, "base64url");
  const iv = value.subarray(0, 12);
  const tag = value.subarray(12, 28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString("utf8");
}
