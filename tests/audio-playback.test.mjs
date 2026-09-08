import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { compatibleAudio } from '../app/audio-playback.ts';

const run = promisify(execFile);
test('streamed WebM becomes finalized, decodable AAC with duration; cache and failure recovery preserve originals', { timeout: 30000 }, async () => {
  const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
  await mkdir('codex-generated/test-data', { recursive: true });
  const dir = await mkdtemp(path.resolve('codex-generated/test-data/playback-'));
  const source = path.join(dir, 'voice.bin');
  // A non-seekable output reproduces MediaRecorder's missing WebM duration.
  const { stdout } = await run(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:a', 'libopus', '-f', 'webm', 'pipe:1'], { encoding: 'buffer' });
  await writeFile(source, stdout);
  const [first, second] = await Promise.all([compatibleAudio(source), compatibleAudio(source)]);
  assert.equal(first, second);
  const mp4 = await readFile(first);
  assert.ok(mp4.indexOf(Buffer.from('moov')) > 0);
  assert.ok(mp4.indexOf(Buffer.from('moov')) < mp4.indexOf(Buffer.from('mdat')), 'metadata precedes audio for mobile loading');
  const { stderr } = await run(ffmpeg, ['-hide_banner', '-i', first, '-f', 'null', '-']);
  assert.match(stderr.toString(), /Duration: 00:00:02\./);
  assert.match(stderr.toString(), /Audio: aac/);
  const modified = (await stat(first)).mtimeMs;
  assert.equal(await compatibleAudio(source), first);
  assert.equal((await stat(first)).mtimeMs, modified);
  assert.deepEqual(await readFile(source), stdout);
  const broken = path.join(dir, 'broken.bin');
  await writeFile(broken, 'invalid audio');
  await assert.rejects(compatibleAudio(broken));
  assert.ok(!(await readdir(dir)).some(name => name.endsWith('.tmp')));
  await writeFile(broken, stdout);
  assert.ok(await compatibleAudio(broken));

  const id = randomUUID();
  await mkdir(path.join(dir, 'chat-files'));
  await writeFile(path.join(dir, 'chat-files', `${id}.bin`), stdout);
  await writeFile(path.join(dir, 'chat-files', `${id}.json`), JSON.stringify({ name: 'voice.webm', mimeType: 'audio/webm', kind: 'audio' }));
  await writeFile(path.join(dir, 'identities.json'), JSON.stringify({ version: 1, users: { alice: { nickname: 'Alice' } } }));
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const secret = randomUUID();
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { env: { ...process.env, FFMPEG_PATH: ffmpeg, DATA_DIR: dir, AUTH_SESSION_SECRET: secret, SITE_PASSWORD: 'fixture', IDENTITY_CODE_HASHES: '' }, stdio: 'ignore', windowsHide: true });
  const origin = `http://127.0.0.1:${port}`;
  const payload = `alice.${Math.floor(Date.now() / 1000) + 600}`;
  const Cookie = `ss_access=${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
  const url = `${origin}/api/chat/files/${id}?playback=1`;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { if ((await fetch(`${origin}/access`)).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready);
    assert.ok([307, 401].includes((await fetch(url, { redirect: 'manual' })).status));
    const response = await fetch(url, { headers: { Cookie } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'audio/mp4');
    const body = Buffer.from(await response.arrayBuffer());
    for (const [Range, start, end] of [['bytes=0-1', 0, 1], ['bytes=-32', body.length - 32, body.length - 1]]) {
      const part = await fetch(url, { headers: { Cookie, Range } });
      assert.equal(part.status, 206);
      assert.equal(part.headers.get('content-range'), `bytes ${start}-${end}/${body.length}`);
      assert.deepEqual(Buffer.from(await part.arrayBuffer()), body.subarray(start, end + 1));
    }
    assert.equal((await fetch(url, { headers: { Cookie, Range: `bytes=${body.length}-` } })).status, 416);
    const original = await fetch(url.replace('?playback=1', ''), { headers: { Cookie } });
    assert.deepEqual(Buffer.from(await original.arrayBuffer()), stdout);
  } finally { child.kill(); }
});
