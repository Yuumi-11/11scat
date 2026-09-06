import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseByteRange } from '../app/byte-range.ts';

test('audio byte ranges support seeking, suffixes and invalid ranges', () => {
  assert.deepEqual(parseByteRange('bytes=10-19', 100), {start:10,end:19});
  assert.deepEqual(parseByteRange('bytes=-20', 100), {start:80,end:99});
  assert.deepEqual(parseByteRange('bytes=80-', 100), {start:80,end:99});
  assert.deepEqual(parseByteRange('bytes=80-999', 100), {start:80,end:99});
  for (const value of ['bytes=200-', 'bytes=-0', 'bytes=20-10', 'bytes=0-1,3-4', 'bytes=-']) assert.equal(parseByteRange(value,100),'invalid');
  assert.equal(parseByteRange(null,100),null);
});

test('manual audio save creates video folder, stays idempotent and enforces quota', async () => {
  const parent = path.resolve('codex-generated/test-data');
  await mkdir(parent, {recursive:true});
  process.env.DATA_DIR = await mkdtemp(path.join(parent,'audio-'));
  process.env.CLOUD_DRIVE_LIMIT_BYTES = '100';
  const store = await import('../app/api/cloud/store.ts');
  const source = path.join(process.env.DATA_DIR,'voice.bin');
  await writeFile(source,Buffer.alloc(60));
  const id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
  const first = await store.importChatAttachment(id,source,'voice.wav',60,'video');
  assert.ok(first.startsWith('video/'));
  assert.equal((await readFile(path.join(store.cloudRoot,first))).length,60);
  assert.equal(await store.importChatAttachment(id,source,'voice.wav',60,'video'),first);
  await assert.rejects(store.importChatAttachment(crypto.randomUUID(),source,'second.wav',60,'video'),store.CloudCapacityError);
});
