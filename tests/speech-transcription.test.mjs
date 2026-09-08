import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createSpeechService, SPEECH_MODEL } from '../app/speech-transcription.ts';

const config = () => ({ account: 'a'.repeat(32), token: 'test-token-private', freePlan: true });
async function fixture(overrides = {}) {
  await mkdir('codex-generated/test-data', { recursive: true });
  const directory = await mkdtemp(path.resolve('codex-generated/test-data/speech-'));
  const options = { directory, config, prepare: async () => ({ audio: Buffer.from('fixture-audio'), seconds: 10 }), fetch: async () => Response.json({ success: true, result: { text: ' 中文识别 ' } }), ...overrides };
  return { options, service: createSpeechService(options), ledger: () => readFile(path.join(directory, 'transcripts-v1.json'), 'utf8').then(JSON.parse) };
}

test('explicit transcription deduplicates concurrent requests, caches across restarts and sends documented base64 payload', async () => {
  let count = 0;
  const f = await fixture({ fetch: async (url, init) => {
    count++; assert.equal(url, `https://api.cloudflare.com/client/v4/accounts/${'a'.repeat(32)}/ai/run/${SPEECH_MODEL}`);
    assert.equal(init.headers.Authorization, 'Bearer test-token-private');
    const body = JSON.parse(init.body); assert.equal(Buffer.from(body.audio, 'base64').toString(), 'fixture-audio'); assert.equal(body.task, 'transcribe');
    return Response.json({ success: true, result: { text: ' 中文识别 ' } });
  } });
  assert.deepEqual(await Promise.all([f.service.transcribe('one'), f.service.transcribe('one')]), ['中文识别', '中文识别']);
  const restarted = createSpeechService({ ...f.options, config: () => ({ account: '', token: '', freePlan: false }) });
  assert.equal(await restarted.transcribe('one'), '中文识别'); assert.equal(count, 1);
  const ledger = await f.ledger(); assert.equal(ledger.seconds, 11); assert.ok(!JSON.stringify(ledger).includes('test-token'));
});

test('daily budget survives restart, fails before remote call, and resets at UTC midnight', async () => {
  let now = Date.parse('2026-09-08T23:59:00Z'), calls = 0;
  const f = await fixture({ now: () => now, prepare: async () => ({ audio: Buffer.from('a'), seconds: 299 }), fetch: async () => { calls++; return Response.json({ success: true, result: { text: 'ok' } }); } });
  for (let i = 0; i < 36; i++) await f.service.transcribe(String(i));
  const restarted = createSpeechService(f.options);
  await assert.rejects(restarted.transcribe('over'), /额度已用完/); assert.equal(calls, 36);
  now += 60000; await restarted.transcribe('over'); assert.equal(calls, 37); assert.equal((await f.ledger()).seconds, 300);
  now = Date.parse('2026-09-09T23:59:59Z');
  const midnight = await fixture({ now: () => now, prepare: async () => { now += 1000; return { audio: Buffer.from('a'), seconds: 10 }; } });
  await midnight.service.transcribe('converted'); assert.equal((await midnight.ledger()).day, '2026-09-10');
});

test('provider throttling blocks new requests until next UTC day, cached text remains available', async () => {
  let calls = 0, now = Date.parse('2026-09-08T10:00:00Z');
  const f = await fixture({ now: () => now, fetch: async () => ++calls === 2 ? new Response('secret-provider-error', { status: 429 }) : Response.json({ success: true, result: { text: 'ok' } }) });
  await f.service.transcribe('cached'); await assert.rejects(f.service.transcribe('limit'), /今日暂停/);
  await assert.rejects(f.service.transcribe('new'), /额度已暂停/); assert.equal(await f.service.transcribe('cached'), 'ok'); assert.equal(calls, 2);
  now = Date.parse('2026-09-09T00:00:00Z'); await f.service.transcribe('new'); assert.equal(calls, 3);
});

test('timeouts and malformed output stay charged, do not expose secrets, require explicit retry after cooldown', async () => {
  let now = Date.parse('2026-09-08T10:00:00Z'), calls = 0;
  const f = await fixture({ now: () => now, fetch: async () => { calls++; throw new Error('test-token-private'); } });
  await assert.rejects(f.service.transcribe('one'), error => !error.message.includes('test-token') && /未完成/.test(error.message));
  await assert.rejects(f.service.transcribe('one'), /不会自动重发/); assert.equal(calls, 1); assert.equal((await f.ledger()).seconds, 11);
  now += 60001; await assert.rejects(f.service.transcribe('one')); assert.equal(calls, 2); assert.equal((await f.ledger()).seconds, 22);
  const malformed = await fixture({ fetch: async () => Response.json({ success: false, errors: [{ message: 'private' }] }) });
  await assert.rejects(malformed.service.transcribe('one'), /未返回有效文字/); assert.equal((await malformed.ledger()).seconds, 11);
});

test('missing authorization, unconfirmed plan, corrupt ledger and oversized input fail without provider calls', async () => {
  let calls = 0;
  for (const override of [{ config: () => ({ ...config(), token: '' }) }, { config: () => ({ ...config(), freePlan: false }) }, { prepare: async () => ({ audio: Buffer.from('a'), seconds: 306 }) }]) {
    const f = await fixture({ fetch: async () => { calls++; }, ...override }); await assert.rejects(f.service.transcribe('one'));
  }
  const f = await fixture({ fetch: async () => { calls++; } }); await writeFile(path.join(f.options.directory, 'transcripts-v1.json'), 'broken');
  await assert.rejects(f.service.transcribe('one'), /记录暂时无法读取/); assert.equal(calls, 0);
});

test('interrupted reservation is not resent on restart, queue caps pending work and runs one provider call at a time', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; }); let calls = 0;
  const f = await fixture({ fetch: async () => { calls++; await gate; return Response.json({ success: true, result: { text: 'ok' } }); } });
  const jobs = Array.from({ length: 6 }, (_, i) => f.service.transcribe(String(i)));
  await assert.rejects(f.service.transcribe('extra'), /繁忙/);
  while (calls === 0) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(calls, 1); await assert.rejects(createSpeechService(f.options).transcribe('0'), /不会自动重发/);
  release(); await Promise.all(jobs); assert.equal(calls, 6);
});
