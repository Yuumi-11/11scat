import { NextResponse } from 'next/server';
import { currentIdentityId } from '../../identity/session';
import { getUser } from '../../identity/store';
import { boardDeletionStore } from './store';

const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
async function authorized() { const id = await currentIdentityId(); return id && await getUser(id); }
export async function GET() {
  if (!await authorized()) return json({ error: '请先登录自习室' }, 401);
  return json({ deletedBoardIds: await boardDeletionStore.read() });
}
export async function POST(request: Request) {
  if (!await authorized()) return json({ error: '请先登录自习室' }, 401);
  const origin = request.headers.get('origin');
  if (origin) { try { if (new URL(origin).host !== (request.headers.get('host') || new URL(request.url).host)) return json({ error: '无效来源' }, 403); } catch { return json({ error: '无效来源' }, 403); } }
  const data = await request.json().catch(() => null);
  if (typeof data?.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(data.id)) return json({ error: '画板编号无效' }, 400);
  return json({ deletedBoardIds: await boardDeletionStore.delete(data.id) });
}
