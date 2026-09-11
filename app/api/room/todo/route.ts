import { NextResponse } from 'next/server';
import { currentIdentityId } from '../../identity/session';
import { getUser, updateUser } from '../../identity/store';

export async function PATCH(request: Request) {
  const identityId = await currentIdentityId();
  if (!identityId || !await getUser(identityId)) return NextResponse.json({ error: '请先登录自习室' }, { status: 401 });
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      const source = new URL(origin);
      if (!['http:', 'https:'].includes(source.protocol) || source.host !== request.headers.get('host')) return NextResponse.json({ error: '无效来源' }, { status: 403 });
    } catch { return NextResponse.json({ error: '无效来源' }, { status: 403 }); }
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body.note !== 'string' || body.note.length > 24 || /[\r\n]/.test(body.note) || Object.keys(body).some(key => key !== 'note')) return NextResponse.json({ error: '小记最多填写 24 个字符' }, { status: 400 });
  await updateUser(identityId, user => ({ ...user, todoNote: body.note, updatedAt: new Date().toISOString() }));
  return NextResponse.json({ note: body.note }, { headers: { 'Cache-Control': 'private, no-store' } });
}
