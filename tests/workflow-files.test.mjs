import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

test('streamed workflow uploads stop at byte limit, clean aborted files, and recheck workflow permission', async () => {
  await mkdir('codex-generated/test-data', { recursive: true });
  const dir = await mkdtemp(path.resolve('codex-generated/test-data/workflow-stream-')), output = path.join(dir, 'storage.mjs');
  await build({ entryPoints: ['app/api/room/tasks/files/storage.ts'], bundle: true, platform: 'node', format: 'esm', outfile: output, logLevel: 'silent' });
  const { uploadFile, MAX_FILE_BYTES } = await import(pathToFileURL(output).href);
  const request = chunks => new Request('http://localhost/upload', { method: 'POST', duplex: 'half', body: new ReadableStream({ pull(controller) { const chunk = chunks.shift(); if (chunk) controller.enqueue(chunk); else controller.close(); } }) });
  const workflow = '62a0f300-c159-474c-a067-174346d935d1';
  await assert.rejects(uploadFile(dir, request([new Uint8Array(MAX_FILE_BYTES), new Uint8Array(1)]), workflow, 'alice', 'large', async () => {}), { status: 413 });
  assert.deepEqual(await readdir(path.join(dir, 'workflow-files')), []);
  let checks = 0;
  await assert.rejects(uploadFile(dir, request([new Uint8Array(10)]), workflow, 'alice', 'stale', async () => { if (++checks > 1) throw new Error('workflow changed'); }), /workflow changed/);
  assert.deepEqual(await readdir(path.join(dir, 'workflow-files')), []);
  await assert.rejects(uploadFile(dir, request([]), workflow, 'alice', '../escape', async () => {}), { status: 400 });
  const file = await uploadFile(dir, request([new Uint8Array(5), new Uint8Array(7)]), workflow, 'alice', 'valid', async () => {});
  assert.equal(file.size, 12); assert.equal((await readdir(path.join(dir, 'workflow-files'))).length, 2);
});
