import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';

test('authenticated HTTP ring lifecycle across two identities and multiple devices', { timeout: 30000 }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), '11scat-ring-http-'));
  await writeFile(path.join(dir, 'identities.json'), JSON.stringify({ version: 1, users: { alice: { nickname: 'Alice', ticktickToken: 'never-expose' }, bob: { nickname: 'Bob' }, eve: { nickname: 'Eve' } } }));
  const secret = randomUUID();
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { env: { ...process.env, DATA_DIR: dir, AUTH_SESSION_SECRET: secret, VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '' }, stdio: 'ignore', windowsHide: true });
  const origin = `http://127.0.0.1:${port}`;
  const cookie = id => { const payload = `${id}.${Math.floor(Date.now()/1000)+600}`; return `ss_access=${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`; };
  async function call(identity, method = 'GET', body, extra = {}) {
    return fetch(`${origin}/api/room/rings`, { method, redirect: 'manual', headers: { Cookie: cookie(identity), 'Content-Type': 'application/json', Origin: origin, ...extra }, ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try { const res = await fetch(`${origin}/access`); if (res.ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert.ok(ready, 'test server started');
    const anonymous = await fetch(`${origin}/api/room/rings`, { redirect: 'manual' });
    assert.ok([307, 401].includes(anonymous.status));
    const snapshot = await (await call('alice')).json();
    assert.equal(snapshot.members.length, 2);
    assert.ok(!JSON.stringify(snapshot).includes('never-expose'));
    const id = randomUUID();
    assert.equal((await call('alice', 'POST', { id, recipientId: 'bob' }, { Origin: 'https://evil.test' })).status, 403);
    const started = await call('alice', 'POST', { id, recipientId: 'bob' });
    assert.equal(started.status, 201);
    const repeat = await call('alice', 'POST', { id: randomUUID(), recipientId: 'bob' });
    assert.equal((await repeat.json()).ring.id, id);
    assert.equal((await (await call('eve')).json()).rings.length, 0);
    assert.equal((await call('alice', 'PATCH', { id, action: 'acknowledge' })).status, 403);
    assert.equal((await call('bob', 'PATCH', { id, action: 'acknowledge' })).status, 200);
    assert.equal((await (await call('alice')).json()).rings[0].state, 'acknowledged');
    assert.equal((await (await call('bob')).json()).rings[0].state, 'acknowledged');
    assert.equal((await (await call('alice', 'POST', { id, recipientId: 'bob' })).json()).ring.state, 'acknowledged');
  } finally { child.kill(); }
});
