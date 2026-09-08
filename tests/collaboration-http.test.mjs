import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';

test('room collaboration HTTP authenticates members, shares the buffer and rejects stale or foreign writes', { timeout: 30000 }, async () => {
  await mkdir('codex-generated/test-data', { recursive: true });
  const dir = await mkdtemp(path.resolve('codex-generated/test-data/cooperation-http-'));
  await writeFile(path.join(dir, 'identities.json'), JSON.stringify({ version: 1, users: { alice: { nickname: 'Alice' }, bob: { nickname: 'Bob' }, offline: { nickname: 'Offline' } } }));
  const legacyFile = path.join(dir, 'room-collaboration.json');
  await writeFile(legacyFile, JSON.stringify({ version: 1, revision: 0, buffer: {}, workflows: {}, operations: { obsolete: { action: 'move', status: 'pending' } }, legacyCleanup: [{ title: 'old warning' }], legacyReset: true }));
  const secret = randomUUID(), socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { env: { ...process.env, DATA_DIR: dir, AUTH_SESSION_SECRET: secret, SITE_PASSWORD: 'fixture-login', IDENTITY_CODE_HASHES: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '' }, stdio: 'ignore', windowsHide: true });
  const origin = `http://127.0.0.1:${port}`;
  const cookie = id => { const payload = `${id}.${Math.floor(Date.now() / 1000) + 600}`; return `ss_access=${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`; };
  const call = (id, body, headers = {}) => fetch(`${origin}/api/room/tasks`, { method: body ? 'POST' : 'GET', redirect: 'manual', headers: { Cookie: cookie(id), Origin: origin, 'Content-Type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { if ((await fetch(`${origin}/access`)).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert.ok(ready);
    const diagnosticPath = '/api/ticktick/diagnostics';
    const loginPage = await (await fetch(`${origin}/access?next=${encodeURIComponent(diagnosticPath)}`)).text();
    assert.match(loginPage, /name="next" value="\/api\/ticktick\/diagnostics"/);
    const login = await fetch(`${origin}/api/access`, { method: 'POST', redirect: 'manual', body: new URLSearchParams({ identityCode: 'fixture-login', next: diagnosticPath }) });
    assert.equal(login.status, 303); assert.equal(login.headers.get('location'), diagnosticPath);
    const badLogin = await fetch(`${origin}/api/access`, { method: 'POST', redirect: 'manual', body: new URLSearchParams({ identityCode: 'wrong', next: diagnosticPath }) });
    assert.equal(new URL(badLogin.headers.get('location'), origin).searchParams.get('next'), diagnosticPath);
    const unlinkedDiagnostics = await fetch(`${origin}${diagnosticPath}`, { headers: { Cookie: cookie('alice') }, redirect: 'manual' });
    assert.equal(unlinkedDiagnostics.status, 401);
    assert.ok([307, 401].includes((await fetch(`${origin}/api/room/tasks`, { redirect: 'manual' })).status));
    assert.equal((await call('unknown')).status, 401);
    assert.ok(JSON.parse(await readFile(legacyFile, 'utf8')).operations.obsolete);
    assert.equal((await fetch(`${origin}/api/room/tasks?revision=1`, { headers: { Cookie: cookie('alice') } })).status, 200);
    const migrated = JSON.parse(await readFile(legacyFile, 'utf8'));
    assert.deepEqual(migrated.operations, {}); assert.ok(!('legacyCleanup' in migrated));
    const inspectPath = `${origin}/api/room/tasks?diagnose=${randomUUID()}`;
    assert.ok([307, 401].includes((await fetch(inspectPath, { redirect: 'manual' })).status));
    assert.equal((await fetch(inspectPath, { headers: { Cookie: cookie('unknown') }, redirect: 'manual' })).status, 401);
    assert.equal((await fetch(inspectPath, { headers: { Cookie: cookie('alice') } })).status, 404);
    assert.equal((await fetch(`${origin}/api/room/tasks?diagnose=invalid`, { headers: { Cookie: cookie('alice') } })).status, 400);
    const create = { id: randomUUID(), action: 'create', fields: { title: '全室共同任务' } };
    assert.equal((await call('alice', create, { Origin: 'https://foreign.example' })).status, 403);
    assert.equal((await call('alice', create)).status, 200);
    assert.equal((await call('alice', create)).status, 200);
    const result = await call('bob'), snapshot = await result.json();
    assert.equal(result.headers.get('cache-control'), 'private, no-store');
    assert.equal(snapshot.members.length, 3);
    assert.ok(snapshot.members.every(member => !member.connected));
    assert.equal(snapshot.buffer.length, 1);
    const task = snapshot.buffer[0], source = { ownerId: null, taskId: task.id, version: task.version };
    assert.equal((await call('bob', { id: randomUUID(), action: 'complete', source })).status, 403);
    assert.equal((await call('bob', { id: randomUUID(), action: 'update', source, fields: { title: '另一成员修改', priority: 5 } })).status, 200);
    assert.equal((await call('alice', { id: randomUUID(), action: 'delete', source })).status, 409);
    const next = (await (await call('alice')).json()).buffer[0];
    assert.equal(next.title, '另一成员修改');
    assert.equal((await call('alice', { id: randomUUID(), action: 'claim', source: { ...source, version: next.version }, destination: 'offline' })).status, 422);
    assert.equal((await call('alice', { id: randomUUID(), action: 'update', source: { ...source, version: next.version }, fields: { ticktickToken: 'injected' } })).status, 400);
    assert.equal((await call('bob', { id: randomUUID(), action: 'delete', source: { ...source, version: next.version } })).status, 200);
    assert.equal((await (await call('alice')).json()).buffer.length, 0);
  } finally { child.kill(); }
});
