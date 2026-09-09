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
  const ledger = await f.ledger(); assert.equal(ledger.version, 2); assert.equal(ledger.seconds, undefined); assert.ok(!JSON.stringify(ledger).includes('test-token'));
});

test('old daily budgets and provider day locks migrate without losing cached transcripts', async () => {
  const f = await fixture();
  await writeFile(path.join(f.options.directory, 'transcripts-v1.json'), JSON.stringify({ version: 1, day: '2026-09-09', seconds: 999999, blockedUntil: Date.now()+86400000, entries: { [SPEECH_MODEL+':old']: { state: 'done', text: '已有文字' } } }));
  assert.equal(await f.service.transcribe('old'), '已有文字');
  for (let i=0;i<38;i++) await createSpeechService({ ...f.options, prepare: async () => ({ audio: Buffer.from('a'), seconds: 305 }) }).transcribe('new'+i);
  const ledger=await f.ledger(); assert.equal(ledger.version,2); assert.equal(ledger.seconds,undefined); assert.equal(ledger.blockedUntil,undefined); assert.equal(Object.keys(ledger.entries).length,39);
});

test('provider throttling honors Retry-After without locking unrelated requests until tomorrow', async () => {
  let calls=0, now=Date.parse('2026-09-09T10:00:00Z');
  const f=await fixture({ now:()=>now, fetch:async()=> ++calls===1 ? new Response('',{status:429,headers:{'Retry-After':'120'}}) : Response.json({success:true,result:{text:'ok'}}) });
  await assert.rejects(f.service.transcribe('limited'), /Cloudflare/);
  assert.equal(await f.service.transcribe('another'),'ok');
  now+=60000; await assert.rejects(f.service.transcribe('limited'),/不会自动重发/);
  now+=61000; assert.equal(await f.service.transcribe('limited'),'ok'); assert.equal(calls,3);
});

test('timeouts and malformed output do not expose secrets and require explicit retry after cooldown', async () => {
  let now = Date.parse('2026-09-08T10:00:00Z'), calls = 0;
  const f = await fixture({ now: () => now, fetch: async () => { calls++; throw new Error('test-token-private'); } });
  await assert.rejects(f.service.transcribe('one'), error => !error.message.includes('test-token') && /未完成/.test(error.message));
  await assert.rejects(f.service.transcribe('one'), /不会自动重发/); assert.equal(calls, 1); assert.equal((await f.ledger()).entries[SPEECH_MODEL+':one'].state, 'failed');
  now += 60001; await assert.rejects(f.service.transcribe('one')); assert.equal(calls, 2); assert.equal((await f.ledger()).seconds, undefined);
  const malformed = await fixture({ fetch: async () => Response.json({ success: false, errors: [{ message: 'private' }] }) });
  await assert.rejects(malformed.service.transcribe('one'), /未返回有效文字/); assert.equal((await malformed.ledger()).entries[SPEECH_MODEL+':one'].state, 'failed');
});

test('missing authorization, unconfirmed plan, corrupt ledger and oversized input fail without provider calls', async () => {
  let calls = 0;
  for (const override of [{ config: () => ({ ...config(), token: '' }) }, { config: () => ({ ...config(), freePlan: false }) }, { prepare: async () => ({ audio: Buffer.from('a'), seconds: 306 }) }]) {
    const f = await fixture({ fetch: async () => { calls++; }, ...override }); await assert.rejects(f.service.transcribe('one'));
  }
  const f = await fixture({ fetch: async () => { calls++; } }); await writeFile(path.join(f.options.directory, 'transcripts-v1.json'), 'broken');
  await assert.rejects(f.service.transcribe('one'), /记录暂时无法读取/); assert.equal(calls, 0);
});

test('three remote requests overlap, audio conversion stays serial, and out-of-order results survive restart', async () => {
  const releases = new Map(); let calls=0, preparing=0, maxPreparing=0;
  const f=await fixture({prepare: async id => { preparing++; maxPreparing=Math.max(maxPreparing,preparing); await new Promise(r=>setTimeout(r,5)); preparing--; return {audio:Buffer.from(id),seconds:10}; }, fetch: async (_,init) => { const id=Buffer.from(JSON.parse(init.body).audio,'base64').toString(); calls++; await new Promise(r=>releases.set(id,r)); return Response.json({success:true,result:{text:'text-'+id}}); }});
  const jobs=Array.from({length:6},(_,i)=>f.service.transcribe(String(i)));
  assert.equal(f.service.transcribe('0'),jobs[0]);
  await assert.rejects(f.service.transcribe('extra'),/繁忙/);
  for(let i=0; calls<3 && i<200;i++) await new Promise(r=>setTimeout(r,5));
  assert.equal(calls,3); assert.equal(maxPreparing,1);
  await assert.rejects(createSpeechService(f.options).transcribe('0'),/不会自动重发/);
  releases.get('2')();
  for(let i=0; calls<4 && i<200;i++) await new Promise(r=>setTimeout(r,5));
  assert.equal(calls,4); releases.get('1')(); releases.get('0')(); releases.get('3')();
  for(let i=0; calls<6 && i<200;i++) await new Promise(r=>setTimeout(r,5));
  assert.equal(calls,6); releases.get('5')(); releases.get('4')();
  assert.deepEqual(await Promise.all(jobs), Array.from({length:6},(_,i)=>'text-'+i));
  const restarted=createSpeechService({...f.options,fetch:async()=>assert.fail('cache should avoid provider')});
  for(let i=0;i<6;i++) assert.equal(await restarted.transcribe(String(i)),'text-'+i);
  assert.equal(Object.keys((await f.ledger()).entries).length,6);
});

test('one failed parallel request preserves successful neighbors and releases its slot', async () => {
  const f = await fixture({ prepare: async id => ({ audio: Buffer.from(id), seconds: 10 }), fetch: async (_, init) => {
    const id = Buffer.from(JSON.parse(init.body).audio, 'base64').toString();
    if (id === 'bad') throw new Error('private provider detail');
    return Response.json({ success: true, result: { text: id } });
  } });
  const results = await Promise.allSettled(['first', 'bad', 'third', 'fourth'].map(id => f.service.transcribe(id)));
  assert.deepEqual(results.map(result => result.status), ['fulfilled', 'rejected', 'fulfilled', 'fulfilled']);
  const entries = (await f.ledger()).entries;
  for (const id of ['first', 'third', 'fourth']) assert.equal(entries[SPEECH_MODEL + ':' + id].text, id);
  assert.equal(entries[SPEECH_MODEL + ':bad'].state, 'failed');
});
