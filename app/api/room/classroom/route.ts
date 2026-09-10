import { NextResponse } from 'next/server';
import { currentIdentityId } from '../../identity/session';
import { getUser, getClassroomProfile, updateClassroomProfile } from '../../identity/store';
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function GET() {
  const id = await currentIdentityId();
  if (!id || !await getUser(id)) return json({ error: '请先登录自习室' }, 401);
  return json(await getClassroomProfile());
}
export async function PATCH(request: Request) {
  const id = await currentIdentityId();
  if (!id || !await getUser(id)) return json({ error: '请先登录自习室' }, 401);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: '无效来源' }, 403);
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.seats) || body.seats.length > 2 || body.seats.some((seat: unknown) => typeof seat !== 'string') || typeof body.font !== 'string') return json({ error: '座位设置无效' }, 400);
  try { await updateClassroomProfile(body.seats, body.font); return json(await getClassroomProfile()); }
  catch (error) { return json({ error: error instanceof Error ? error.message : '设置保存失败' }, 400); }
}
