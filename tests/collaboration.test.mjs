import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { CollaborationError, CollaborationStore, remoteVersion, taskFields } from '../app/api/room/tasks/store.ts';

async function fixture() {
  await mkdir('codex-generated/test-data', { recursive: true });
  const dir = await mkdtemp(path.resolve('codex-generated/test-data/cooperation-'));
  const accounts = { alice: new Map(), bob: new Map() }, counts = { creates: 0, removes: 0 };
  let loseCreate = false, loseDelete = false, afterCreate = null;
  const gateway = {
    members: async () => [{ id: 'alice', name: 'Alice', connected: true }, { id: 'bob', name: 'Bob', connected: true }, { id: 'offline', name: 'Offline', connected: false }],
    inbox: async owner => { if (!accounts[owner]) throw new Error('not connected'); return { projectId: 'inbox-' + owner, tasks: [...accounts[owner].values()].map(task => structuredClone(task)) }; },
    get: async (owner, id) => structuredClone(accounts[owner].get(id) || null),
    create: async (owner, id, fields) => {
      if (!accounts[owner].has(id)) { counts.creates++; accounts[owner].set(id, { id, projectId: 'inbox-' + owner, ...structuredClone(fields) }); }
      if (afterCreate) afterCreate();
      if (loseCreate) { loseCreate = false; throw new Error('response lost'); }
    },
    update: async (owner, id, fields) => { Object.assign(accounts[owner].get(id), structuredClone(fields)); },
    remove: async (owner, id) => { counts.removes++; accounts[owner].delete(id); if (loseDelete) { loseDelete = false; throw new Error('delete response lost'); } },
    complete: async (owner, id) => { accounts[owner].get(id).status = 2; },
    checkTransfer: async () => {},
  };
  const store = new CollaborationStore(dir, gateway);
  const create = async title => { await store.execute('alice', { id: randomUUID(), action: 'create', fields: { title, priority: 3 } }); return (await store.snapshot('alice')).buffer.find(task => task.title === title); };
  return { dir, gateway, store, create, accounts, counts, loseCreate: () => { loseCreate = true; }, loseDelete: () => { loseDelete = true; }, afterCreate: fn => { afterCreate = fn; } };
}
const source = task => ({ ownerId: task.ownerId, taskId: task.id, version: task.version });

test('collaboration includes the captured redacted diagnostic for the member whose inbox failed', async () => {
  const f = await fixture(), inbox = f.gateway.inbox;
  const diagnostic = JSON.stringify({ version: 2, shape: { project: { id: 'undefined' } } });
  f.gateway.inbox = async owner => { if (owner === 'bob') throw new CollaborationError('format mismatch', 502, diagnostic); return inbox(owner); };
  const snapshot = await f.store.snapshot('alice');
  assert.equal(snapshot.members.find(member => member.id === 'bob').diagnostic, diagnostic);
  assert.equal(snapshot.members.find(member => member.id === 'alice').diagnostic, undefined);
});

test('an unresolved empty destination is rejected before a transfer is recorded or either account is written', async () => {
  const f = await fixture(), task = await f.create('保留在缓冲区'), inbox = f.gateway.inbox;
  f.gateway.inbox = async owner => owner === 'bob' ? { projectId: 'inbox', tasks: [] } : inbox(owner);
  await assert.rejects(f.store.execute('alice', { id: randomUUID(), action: 'move', source: source(task), destination: 'bob' }), { status: 422 });
  assert.equal(f.counts.creates, 0); assert.equal(f.counts.removes, 0);
  const snapshot = await f.store.snapshot('alice');
  assert.equal(snapshot.buffer.length, 1);
  assert.equal(snapshot.operations.filter(op => op.status === 'pending').length, 0);
});
test('buffer claims serialize across users, creation retries dedupe and tasks can be reassigned or returned', async () => {
  const f = await fixture();
  const command = { id: randomUUID(), action: 'create', fields: { title: '共同整理笔记', priority: 3 } };
  await Promise.all([f.store.execute('alice', command), f.store.execute('alice', command)]);
  const task = (await f.store.snapshot('alice')).buffer[0];
  assert.equal((await f.store.snapshot('alice')).buffer.length, 1);
  const moves = await Promise.allSettled(['alice', 'bob'].map(owner => f.store.execute(owner, { id: randomUUID(), action: 'move', source: source(task), destination: owner })));
  assert.equal(moves.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(f.counts.creates, 1);
  assert.equal((await f.store.snapshot('alice')).buffer.length, 0);
  const owned = (await f.store.snapshot('alice')).members.flatMap(member => member.tasks)[0];
  const destination = owned.ownerId === 'alice' ? 'bob' : 'alice';
  await f.store.execute('bob', { id: randomUUID(), action: 'move', source: source(owned), destination });
  assert.equal(f.accounts[owned.ownerId].size, 0); assert.equal(f.accounts[destination].size, 1);
  const reassigned = (await f.store.snapshot('alice')).members.find(member => member.id === destination).tasks[0];
  await f.store.execute('alice', { id: randomUUID(), action: 'move', source: source(reassigned), destination: null });
  assert.equal(f.accounts[destination].size, 0);
  assert.equal((await f.store.snapshot('alice')).buffer[0].priority, 3);
  await assert.rejects(f.store.execute('stranger', { id: randomUUID(), action: 'create', fields: { title: 'x' } }), { status: 403 });
});
test('lost creation and deletion responses resume across service restarts without losing or duplicating tasks', async () => {
  const f = await fixture(), task = await f.create('准备习题');
  f.loseCreate();
  const op = await f.store.execute('alice', { id: randomUUID(), action: 'move', source: source(task), destination: 'bob' });
  assert.equal(op.status, 'pending'); assert.equal(f.accounts.bob.size, 1);
  assert.equal((await f.store.snapshot('alice')).buffer.length, 1);
  const restarted = new CollaborationStore(f.dir, f.gateway);
  await restarted.resume('bob', op.id);
  assert.equal(f.counts.creates, 1); assert.equal((await restarted.snapshot('bob')).buffer.length, 0);
  const owned = (await restarted.snapshot('bob')).members.find(member => member.id === 'bob').tasks[0];
  f.loseDelete();
  const returned = await restarted.execute('bob', { id: randomUUID(), action: 'move', source: source(owned), destination: null });
  assert.equal(returned.status, 'pending'); assert.equal(f.accounts.bob.size, 0);
  const again = new CollaborationStore(f.dir, f.gateway);
  await again.resume('alice', returned.id);
  const snapshot = await again.snapshot('alice');
  assert.equal(snapshot.buffer.length, 1); assert.equal(snapshot.buffer[0].pending, undefined);
});

test('transfer inspection identifies changed fields without exposing values or writing either account or operation state', async () => {
  const f = await fixture(), task = await f.create('private-task-title');
  f.loseCreate();
  const op = await f.store.execute('alice', { id: randomUUID(), action: 'move', source: source(task), destination: 'bob' });
  const target = [...f.accounts.bob.values()][0];
  target.timeZone = 'Europe/London';
  const stateBefore = await readFile(path.join(f.dir, 'room-collaboration.json'), 'utf8');
  const countsBefore = { ...f.counts };
  const result = await f.store.inspectTransfer('alice', op.id);
  assert.equal(result.sourceExists, true);
  assert.equal(result.sourceUnchanged, true);
  assert.equal(result.destinationExists, true);
  assert.deepEqual(result.differences, ['时区']);
  assert.match(result.message, /时区/);
  for (const secret of [task.title, task.id, target.id, target.projectId, target.timeZone]) assert.equal(JSON.stringify(result).includes(secret), false);
  assert.deepEqual(f.counts, countsBefore);
  assert.equal(await readFile(path.join(f.dir, 'room-collaboration.json'), 'utf8'), stateBefore);
  await assert.rejects(f.store.inspectTransfer('stranger', op.id), { status: 403 });
  await assert.rejects(f.store.inspectTransfer('alice', 'invalid'), { status: 400 });
  await assert.rejects(f.store.inspectTransfer('alice', randomUUID()), { status: 404 });
});

test('transfer inspection distinguishes missing and completed copies and does not resume a verified pending transfer', async () => {
  const f = await fixture(), task = await f.create('waiting');
  f.loseCreate();
  const op = await f.store.execute('alice', { id: randomUUID(), action: 'move', source: source(task), destination: 'bob' });
  let result = await f.store.inspectTransfer('bob', op.id);
  assert.equal(result.status, 'pending'); assert.deepEqual(result.differences, []);
  assert.match(result.message, /核对一致/);
  assert.equal((await f.store.snapshot('alice')).buffer.length, 1);
  const target = [...f.accounts.bob.values()][0];
  target.status = 2;
  result = await f.store.inspectTransfer('alice', op.id);
  assert.equal(result.destinationCompleted, true);
  f.accounts.bob.clear();
  result = await f.store.inspectTransfer('alice', op.id);
  assert.equal(result.destinationExists, false); assert.match(result.message, /未读到接收方副本/);
  assert.equal(f.counts.removes, 0);
});
test('source edits during transfer preserve the original and allow rolling back an unchanged copy', async () => {
  const f = await fixture();
  const remote = { ...taskFields({ title: '原任务' }), id: 'original', projectId: 'inbox-alice' };
  f.accounts.alice.set(remote.id, remote);
  f.afterCreate(() => { remote.title = '滴答中刚修改的任务'; });
  const op = await f.store.execute('bob', { id: randomUUID(), action: 'move', source: { ownerId: 'alice', taskId: remote.id, version: remoteVersion(remote) }, destination: 'bob' });
  assert.equal(op.status, 'pending'); assert.equal(f.accounts.alice.size, 1); assert.equal(f.accounts.bob.size, 1);
  await f.store.resume('alice', op.id, true);
  assert.equal(f.accounts.bob.size, 0); assert.equal(f.accounts.alice.get(remote.id).title, '滴答中刚修改的任务');
});
test('edits reject stale versions and invalid destinations while complete/delete affect the chosen account only', async () => {
  const f = await fixture(), task = await f.create('待编辑');
  await f.store.execute('bob', { id: randomUUID(), action: 'update', source: source(task), fields: { title: '已更新', priority: 5, dueDate: '2026-09-10T12:00:00+0800' } });
  await assert.rejects(f.store.execute('alice', { id: randomUUID(), action: 'update', source: source(task), fields: { title: '过期覆盖' } }), /已被修改/);
  const updated = (await f.store.snapshot('alice')).buffer[0];
  await assert.rejects(f.store.execute('alice', { id: randomUUID(), action: 'move', source: source(updated), destination: 'stranger' }), { status: 400 });
  await f.store.execute('alice', { id: randomUUID(), action: 'move', source: source(updated), destination: 'bob' });
  const owned = (await f.store.snapshot('alice')).members.find(member => member.id === 'bob').tasks[0];
  assert.equal(owned.dueDate, '2026-09-10T04:00:00.000Z');
  await f.store.execute('alice', { id: randomUUID(), action: 'complete', source: source(owned) });
  assert.equal(f.accounts.bob.get(owned.id).status, 2); assert.equal(f.accounts.alice.size, 0);
  const deletable = await f.create('仅删除这一项');
  await f.store.execute('bob', { id: randomUUID(), action: 'delete', source: source(deletable) });
  assert.equal((await f.store.snapshot('alice')).buffer.length, 0);
});
