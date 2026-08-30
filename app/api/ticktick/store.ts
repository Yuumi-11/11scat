import { cookies } from "next/headers";
import { currentIdentityId } from "../identity/session";
import { getUser, updateUser } from "../identity/store";
import { decryptToken, encryptToken } from "./crypto";

export async function accessToken(): Promise<string | null> {
  const identityId = await currentIdentityId();
  if (!identityId) return null;
  const user = await getUser(identityId);
  if (user?.ticktickToken) {
    try { return decryptToken(user.ticktickToken); } catch { return null; }
  }

  const legacyPayload = (await cookies()).get("tt_access")?.value;
  if (!legacyPayload) return null;
  try {
    const token = decryptToken(legacyPayload);
    await saveAccessToken(token);
    return token;
  } catch {
    return null;
  }
}

export async function saveAccessToken(token: string): Promise<boolean> {
  const identityId = await currentIdentityId();
  if (!identityId) return false;
  await updateUser(identityId, (current) => ({
    ...current,
    ticktickToken: encryptToken(token),
    updatedAt: new Date().toISOString(),
  }));
  return true;
}

export async function clearAccessToken(): Promise<boolean> {
  const identityId = await currentIdentityId();
  if (!identityId) return false;
  await updateUser(identityId, (current) => {
    const next = { ...current, updatedAt: new Date().toISOString() };
    delete next.ticktickToken;
    return next;
  });
  return true;
}
