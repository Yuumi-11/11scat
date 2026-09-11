import { NextResponse } from 'next/server';
import { currentIdentityId } from '../../identity/session';
import { getUser, getClassroomProfile, updateClassroomProfile } from '../../identity/store';
import { parseClassroomAction } from '../../../classroom-settings-action';
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
  if (origin) {
    try {
      const source = new URL(origin);
      if (!['http:', 'https:'].includes(source.protocol) || source.host !== (request.headers.get('host') || new URL(request.url).host)) return json({ error: '无效来源' }, 403);
    } catch { return json({ error: '无效来源' }, 403); }
  }
  const action = parseClassroomAction(await request.json().catch(() => null));
  if (!action) return json({ error: '设置操作无效' }, 400);
  try { return json(await updateClassroomProfile(id, action)); }
  catch (error) { return json({ error: error instanceof Error ? error.message : '设置保存失败' }, 400); }
}
