import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { SPEECH_MODEL } from '../app/speech-transcription.ts';

test('transcript endpoint authenticates members, rejects foreign origin, shares cached sent audio and hides recalled/orphan files', { timeout: 30000 }, async () => {
  await mkdir('codex-generated/test-data', { recursive: true });
  const dir = await mkdtemp(path.resolve('codex-generated/test-data/speech-http-'));
  const audio = randomUUID(), recalled = randomUUID(), file = randomUUID(), unconfigured = randomUUID();
  await writeFile(path.join(dir, 'identities.json'), JSON.stringify({ version: 1, users: { alice: { nickname: 'Alice' }, bob: { nickname: 'Bob' } } }));
  await writeFile(path.join(dir, 'chat-messages.json'), JSON.stringify({ version: 1, messages: [audio, recalled, file, unconfigured].map(id => ({ id: randomUUID(), identityId: 'alice', recalled: id === recalled, attachment: { id, kind: id === file ? 'file' : 'audio' } })) }));
  await mkdir(path.join(dir, 'speech'));
  await writeFile(path.join(dir, 'speech', 'transcripts-v1.json'), JSON.stringify({ version: 1, day: '2026-09-08', seconds: 1, blockedUntil: 0, entries: Object.fromEntries([audio, recalled, file].map(id => [`${SPEECH_MODEL}:${id}`, { state: 'done', text: '已缓存的语音文字' }])) }));
  const secret = randomUUID(), socket = createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve)); const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { env: { ...process.env, DATA_DIR: dir, AUTH_SESSION_SECRET: secret, SITE_PASSWORD: 'fixture', IDENTITY_CODE_HASHES: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', CLOUDFLARE_ACCOUNT_ID: '', CLOUDFLARE_WORKERS_AI_TOKEN: '', CLOUDFLARE_AI_FREE_PLAN_CONFIRMED: 'false' }, stdio: 'ignore', windowsHide: true });
  const origin = `http://127.0.0.1:${port}`;
  const cookie = id => { const payload = `${id}.${Math.floor(Date.now() / 1000) + 600}`; return `ss_access=${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`; };
  const call = (id, user = 'alice', from = origin) => fetch(`${origin}/api/chat/files/${id}/transcript`, { method: 'POST', headers: { ...(user ? { Cookie: cookie(user) } : {}), ...(from ? { Origin: from } : {}) }, redirect: 'manual' });
  try {
    let ready = false; for (let i = 0; i < 80; i++) { try { if ((await fetch(origin + '/access')).ok) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 200)); } assert.ok(ready);
    assert.ok([401, 307].includes((await call(audio, '')).status)); assert.equal((await call(audio, 'unknown')).status, 401);
    assert.equal((await call(audio, 'alice', 'https://other.example')).status, 403); assert.equal((await call(audio, 'alice', '')).status, 403);
    for (const id of [recalled, file, randomUUID(), 'invalid']) assert.equal((await call(id)).status, 404);
    const response = await call(audio, 'bob'); assert.equal(response.status, 200); assert.equal((await response.json()).text, '已缓存的语音文字'); assert.match(response.headers.get('cache-control'), /no-store/);
    const unavailable = await call(unconfigured); assert.equal(unavailable.status, 503); assert.match((await unavailable.json()).error, /尚未连接/);
  } finally { child.kill(); }
});
