import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ACCESS_COOKIE = "ss_access";

const identityPattern = /^[A-Za-z0-9_-]{1,64}$/;

function sessionSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET
    || process.env.TICKTICK_STORAGE_SECRET
    || process.env.TICKTICK_COOKIE_SECRET
    || process.env.SITE_PASSWORD;
  if (!secret) throw new Error("Identity session signing is not configured");
  return secret;
}

function signature(value: string): string {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

export function createIdentitySession(identityId: string, maxAgeSeconds = 60 * 60 * 24 * 30): string {
  if (!identityPattern.test(identityId)) throw new Error("Invalid identity id");
  const expiresAt = Math.floor(Date.now() / 1000) + maxAgeSeconds;
  const payload = `${identityId}.${expiresAt}`;
  return `${payload}.${signature(payload)}`;
}

export function verifyIdentitySession(token?: string): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [identityId, expiresAtText, suppliedSignature] = parts;
  if (!identityPattern.test(identityId) || !/^\d+$/.test(expiresAtText)) return null;
  if (Number(expiresAtText) <= Math.floor(Date.now() / 1000)) return null;
  const expectedSignature = signature(`${identityId}.${expiresAtText}`);
  const expectedBytes = Buffer.from(expectedSignature);
  const suppliedBytes = Buffer.from(suppliedSignature);
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) return null;
  return identityId;
}

export async function currentIdentityId(): Promise<string | null> {
  return verifyIdentitySession((await cookies()).get(ACCESS_COOKIE)?.value);
}

function identityCodeHash(code: string): string {
  return createHash("sha256").update(`11scat-identity-code:${code}`).digest("hex");
}

export function resolveIdentityCode(code: string): string | null {
  const suppliedHash = identityCodeHash(code);
  const configured = process.env.IDENTITY_CODE_HASHES;
  if (configured) {
    try {
      const mappings = JSON.parse(configured) as Record<string, unknown>;
      for (const [expectedHash, identityId] of Object.entries(mappings)) {
        if (!/^[a-f0-9]{64}$/.test(expectedHash) || typeof identityId !== "string" || !identityPattern.test(identityId)) continue;
        const expectedBytes = Buffer.from(expectedHash);
        const suppliedBytes = Buffer.from(suppliedHash);
        if (expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes)) return identityId;
      }
    } catch {
      return null;
    }
    return null;
  }

  const legacyPassword = process.env.SITE_PASSWORD;
  if (!legacyPassword) return null;
  const submittedBytes = Buffer.from(code);
  const expectedBytes = Buffer.from(legacyPassword);
  return submittedBytes.length === expectedBytes.length && timingSafeEqual(submittedBytes, expectedBytes)
    ? "legacy"
    : null;
}
