import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';

test('activity survives fresh requests, stays private, and can be replaced or cleared', { timeout: 30000 }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), '11scat-activity-'));
  await writeFile(path.join(dir, 'identities.json'), JSON.stringify({ version: 1, users: { alice: { nickname: 'Alice', ticktickToken: 'keep-secret' }, bob: { nickname: 'Bob' } } }));
  const secret = randomUUID();
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { env: { ...process.env, DATA_DIR: dir, AUTH_SESSION_SECRET: secret }, stdio: 'ignore', windowsHide: true });
  const origin = `http://127.0.0.1:${port}`;
  const cookie = id => { const payload = `${id}.${Math.floor(Date.now()/1000)+600}`; return `ss_access=${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`; };
  const call = (identity, body) => fetch(`${origin}/api/identity/me`, { method: body === undefined ? 'GET' : 'PATCH', redirect: 'manual', headers: { Cookie: cookie(identity), 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${origin}/access`)).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert.ok(ready);
    assert.equal((await (await call('alice')).json()).activity, '');
    assert.equal((await call('alice', { activity: '  英语作业  ' })).status, 200);
    assert.deepEqual(await (await call('alice')).json(), { identityId: 'alice', nickname: 'Alice', activity: '英语作业' });
    assert.equal((await (await call('bob')).json()).activity, '');
    const saved = JSON.parse(await readFile(path.join(dir, 'identities.json'), 'utf8'));
    assert.equal(saved.users.alice.activity, '英语作业');
    assert.equal(saved.users.alice.ticktickToken, 'keep-secret');
    assert.equal((await call('alice', { activity: null })).status, 400);
    assert.equal((await (await call('alice')).json()).activity, '英语作业');
    await call('alice', { activity: '写'.repeat(100) });
    assert.equal((await (await call('alice')).json()).activity, '写'.repeat(80));
    await call('alice', { activity: '' });
    assert.equal((await (await call('alice')).json()).activity, '');
    const anonymous = await fetch(`${origin}/api/identity/me`, { method: 'PATCH', redirect: 'manual', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activity: 'forbidden' }) });
    assert.ok([307, 401].includes(anonymous.status));
  } finally { child.kill(); }
});
