import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { encryptToken } from '../app/api/ticktick/crypto.ts';
import { remoteVersion, taskFields } from '../app/api/room/tasks/store.ts';

test('Dida provider works with Open API credentials despite V2 rejection and scopes transfers to the owner inbox', async () => {
  await mkdir('codex-generated/test-data', { recursive: true });
  const dir = await mkdtemp(path.resolve('codex-generated/test-data/cooperation-provider-'));
  const previousDir = process.env.DATA_DIR, previousSecret = process.env.TICKTICK_STORAGE_SECRET;
  process.env.DATA_DIR = dir; process.env.TICKTICK_STORAGE_SECRET = 'synthetic-test-key';
  const originalFetch = globalThis.fetch;
  try {
    await writeFile(path.join(dir, 'identities.json'), JSON.stringify({ version: 1, users: { alice: { nickname: 'Alice', ticktickToken: encryptToken('token-alice') }, bob: { nickname: 'Bob', ticktickToken: encryptToken('token-bob') } } }));
    const output = path.join(dir, 'provider.mjs');
    await build({ entryPoints: ['app/api/room/tasks/provider.ts'], bundle: true, platform: 'node', format: 'esm', outfile: output, logLevel: 'silent' });
    const { gateway } = await import(pathToFileURL(output).href);
    const accounts = { alice: new Map(), bob: new Map() }, requests = [];
    let comments = [], wrongProject = false;
    globalThis.fetch = async (url, init) => {
      const owner = String(init.headers.Authorization).replace('Bearer token-', '');
      assert.ok(Object.hasOwn(accounts, owner), 'request uses the selected owner token');
      const route = new URL(url).pathname, method = init.method || 'GET';
      const body = init.body ? JSON.parse(init.body) : null;
      requests.push({ owner, route, method, body });
      if (route === '/api/v2/batch/check/0') return new Response(null, { status: 401 });
      if (route === '/open/v1/project/inbox/data') return Response.json({ tasks: [...accounts[owner].values()], columns: [] });
      if (route === '/open/v1/project/inbox') return Response.json({ id: `inbox-${owner}` });
      if (route === '/open/v1/task/batch') {
        for (const task of body.add) { assert.equal(task.projectId, `inbox-${owner}`); accounts[owner].set(task.id, structuredClone(task)); }
        return Response.json({ id2etag: {} });
      }
      if (method === 'POST' && /^\/open\/v1\/task\/[^/]+$/.test(route)) {
        assert.equal(body.projectId, `inbox-${owner}`); accounts[owner].set(body.id, structuredClone(body)); return Response.json(body);
      }
      assert.ok(route.startsWith(`/open/v1/project/inbox-${owner}/`), 'project route cannot use another owner inbox');
      if (route.endsWith('/data')) return Response.json({ tasks: [...accounts[owner].values(), { id: 'outside', projectId: 'other-list' }] });
      if (route.endsWith('/comments')) return Response.json(comments);
      const id = route.split('/')[6];
      if (method === 'DELETE') { accounts[owner].delete(id); return new Response(null, { status: 204 }); }
      if (route.endsWith('/complete')) { accounts[owner].get(id).status = 2; return new Response(null, { status: 204 }); }
      const task = accounts[owner].get(id);
      return task ? Response.json({ ...task, ...(wrongProject ? { projectId: 'foreign' } : {}) }) : new Response(null, { status: 404 });
    };
    const fields = taskFields({ title: '跨账户完整字段', content: '说明', desc: '检查项说明', kind: 'CHECKLIST', items: [{ id: 'item1', title: '检查项', status: 0 }], priority: 5, startDate: '2026-09-09T01:00:00.000Z', dueDate: '2026-09-09T02:00:00.000Z', tags: ['study'], reminders: ['TRIGGER:-PT15M'], repeatFlag: 'RRULE:FREQ=WEEKLY;INTERVAL=1', repeatFrom: '1', isAllDay: false });
    await gateway.create('bob', 'stable-task-id', fields);
    await gateway.create('bob', 'stable-task-id', fields);
    assert.equal(requests.filter(request => request.route.endsWith('/task/batch')).length, 1);
    assert.equal(accounts.alice.size, 0);
    assert.equal(accounts.bob.get('stable-task-id').startDate, '2026-09-09T01:00:00+0000');
    let task = await gateway.get('bob', 'stable-task-id');
    assert.deepEqual(task.items, fields.items); assert.equal(task.repeatFrom, '1');
    task.providerMetadata = { preserved: true }; accounts.bob.set(task.id, task);
    await gateway.update('bob', task.id, { ...fields, title: '修改优先级', priority: 3 }, remoteVersion(task));
    assert.deepEqual(accounts.bob.get(task.id).providerMetadata, { preserved: true });
    await assert.rejects(gateway.update('bob', task.id, fields, remoteVersion(task)), /刚被修改/);
    task = await gateway.get('bob', task.id);
    assert.equal((await gateway.inbox('bob')).tasks.length, 1);
    wrongProject = true;
    await assert.rejects(gateway.get('bob', task.id), { status: 403 }); wrongProject = false;
    await gateway.checkTransfer('bob', task);
    comments = [{ id: 'comment' }]; await assert.rejects(gateway.checkTransfer('bob', task), /评论/); comments = [];
    await assert.rejects(gateway.checkTransfer('bob', { ...task, attachments: [{}] }), /附件/);
    await assert.rejects(gateway.checkTransfer('bob', { ...task, attachments: { count: 1 } }), /附件/);
    await assert.rejects(gateway.checkTransfer('bob', { ...task, focusSummaries: [{}] }), /专注历史/);
    accounts.bob.set('child', { id: 'child', projectId: 'inbox-bob', parentId: task.id });
    await assert.rejects(gateway.checkTransfer('bob', task), /子任务/); accounts.bob.delete('child');
    await gateway.complete('bob', task.id); assert.equal(accounts.bob.get(task.id).status, 2);
    await gateway.remove('bob', task.id); await gateway.remove('bob', task.id);
    assert.equal(accounts.bob.size, 0);
    await gateway.inbox('alice');
    assert.ok(requests.some(request => request.owner === 'alice'));
    assert.equal(requests.filter(request => request.route.startsWith('/api/v2/')).length, 0);
    assert.equal(requests.filter(request => request.owner === 'alice' && request.method !== 'GET').length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousDir === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previousDir;
    if (previousSecret === undefined) delete process.env.TICKTICK_STORAGE_SECRET; else process.env.TICKTICK_STORAGE_SECRET = previousSecret;
  }
});
