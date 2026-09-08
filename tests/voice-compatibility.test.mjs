import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, stat, writeFile, readdir } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { createHmac, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { compatibleAudio } from '../app/audio-playback.ts';
const exec = promisify(execFile), ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg', ffprobe = process.env.FFPROBE_PATH || 'ffprobe';

test('real WebM converts to AAC, concurrent plays share a cache, HTTP seeking preserves original bytes', { timeout: 45000 }, async t => {
  try { await exec(ffmpeg, ['-version'], { windowsHide: true }); await exec(ffprobe, ['-version'], { windowsHide: true }); } catch (error) { if (error.code === 'ENOENT') { t.skip('Install ffmpeg/ffprobe or set FFMPEG_PATH and FFPROBE_PATH for codec integration'); return; } throw error; }
  await mkdir('codex-generated/test-data', { recursive: true }); const dir = await mkdtemp(path.resolve('codex-generated/test-data/audio-playback-')), folder = path.join(dir, 'chat-files'); await mkdir(folder);
  const id = randomUUID(), source = path.join(folder, id + '.bin');
  await exec(ffmpeg, ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:a', 'libopus', '-f', 'webm', source], { windowsHide: true });
  const original = await readFile(source), outputs = await Promise.all([compatibleAudio(source), compatibleAudio(source), compatibleAudio(source)]);
  assert.equal(new Set(outputs).size, 1); const cache = outputs[0], before = await stat(cache);
  const probe = JSON.parse((await exec(ffprobe, ['-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'json', cache], { windowsHide: true })).stdout); assert.equal(probe.streams[0].codec_name, 'aac');
  assert.deepEqual(await readFile(source), original); await compatibleAudio(source); assert.equal((await stat(cache)).mtimeMs, before.mtimeMs);
  const bad = path.join(folder, 'bad.bin'); await writeFile(bad, 'not audio'); await assert.rejects(compatibleAudio(bad)); assert.ok(!(await readdir(folder)).some(file => file.startsWith('bad.bin.') && file.endsWith('.m4a')));
  await writeFile(path.join(folder, id + '.json'), JSON.stringify({ name: '旧语音.webm', mimeType: 'audio/webm;codecs=opus' }));
  const secret = randomUUID(), socket = createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve)); const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { env: { ...process.env, DATA_DIR: dir, AUTH_SESSION_SECRET: secret, SITE_PASSWORD: 'fixture', IDENTITY_CODE_HASHES: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '' }, stdio: 'ignore', windowsHide: true });
  const origin = `http://127.0.0.1:${port}`, payload = `alice.${Math.floor(Date.now() / 1000) + 600}`, cookie = `ss_access=${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
  try {
    let ready = false; for (let i = 0; i < 60; i++) { try { if ((await fetch(origin + '/access')).ok) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 200)); } assert.ok(ready);
    const route = origin + '/api/chat/files/' + id;
    assert.ok([307,401].includes((await fetch(route + '?playback=1', { redirect: 'manual' })).status));
    let response = await fetch(route, { headers: { Cookie: cookie } }); assert.match(response.headers.get('content-type'), /audio\/webm/); assert.deepEqual(Buffer.from(await response.arrayBuffer()), original);
    response = await fetch(route + '?playback=1', { headers: { Cookie: cookie, Range: 'bytes=0-1' } }); assert.equal(response.status, 206); assert.equal(response.headers.get('content-type'), 'audio/mp4'); assert.equal(response.headers.get('accept-ranges'), 'bytes'); assert.equal((await response.arrayBuffer()).byteLength, 2); assert.match(response.headers.get('content-range'), /^bytes 0-1\//);
    response = await fetch(route + '?playback=1', { headers: { Cookie: cookie } }); assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(cache));
    response = await fetch(route + '?playback=1', { headers: { Cookie: cookie, Range: 'bytes=999999999-' } }); assert.equal(response.status, 416);
  } finally { child.kill(); }
});
