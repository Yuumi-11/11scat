import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
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

test('reading either member inbox never creates transfers and preserves task ownership', async () => {
  const f = await fixture();
  f.accounts.bob.set('original-bob-task', { id: 'original-bob-task', projectId: 'inbox-bob', ...taskFields({ title: 'already in Bob inbox' }) });
  for (const viewer of ['alice', 'bob', 'alice']) {
    const snapshot = await f.store.snapshot(viewer);
    assert.equal(snapshot.members.find(member => member.id === 'alice').tasks.length, 0);
    const [task] = snapshot.members.find(member => member.id === 'bob').tasks;
    assert.equal(task.ownerId, 'bob'); assert.equal(task.id, 'original-bob-task');
    assert.equal(snapshot.operations.length, 0);
    assert.equal((await f.store.revision()).revision, 0);
  }
  assert.deepEqual(f.counts, { creates: 0, removes: 0 });
  await assert.rejects(readFile(path.join(f.dir, 'room-collaboration.json')), { code: 'ENOENT' });
});

test('collaboration includes the captured redacted diagnostic for the member whose inbox failed', async () => {
  const f = await fixture(), inbox = f.gateway.inbox;
  const diagnostic = JSON.stringify({ version: 2, shape: { project: { id: 'undefined' } } });
  f.gateway.inbox = async owner => { if (owner === 'bob') throw new CollaborationError('format mismatch', 502, diagnostic); return inbox(owner); };
  const snapshot = await f.store.snapshot('alice');
  assert.equal(snapshot.members.find(member => member.id === 'bob').diagnostic, diagnostic);
  assert.equal(snapshot.members.find(member => member.id === 'alice').diagnostic, undefined);
});

const claim = (f, task, actor = 'bob', destination = actor) => f.store.claim(actor, { id: randomUUID(), action: 'claim', source: source(task), destination });
const act = (f, workflow, actor, action, extra = {}) => f.store.workflowCommand(actor, { id: randomUUID(), workflowId: workflow.id, version: workflow.version, action, ...extra });
async function personal(f, fields = {}) {
  const task = { id: 'original-task', projectId: 'inbox-alice', ...taskFields({ title: '共同复习', ...fields }) };
  f.accounts.alice.set(task.id, task);
  return { ...task, ownerId: 'alice', version: remoteVersion(task) };
}

test('personal claim preserves original and fields, submits without completion, rejects with comments, then completes both only on approval', async () => {
  const f = await fixture(), task = await personal(f, { priority: 5, dueDate: '2026-09-12T12:00:00+0800', tags: ['study'] });
  let w = await claim(f, task);
  assert.equal(w.status, 'working'); assert.equal(w.reviewerId, 'alice'); assert.equal(w.claimantId, 'bob');
  assert.equal(f.accounts.alice.size, 1); assert.equal(f.accounts.bob.size, 1); assert.equal(f.counts.removes, 0);
  assert.equal(f.accounts.bob.get(w.targetId).title, task.title); assert.equal(f.accounts.bob.get(w.targetId).priority, 5);
  await assert.rejects(act(f, w, 'alice', 'submit'), { status: 403 });
  w = await act(f, w, 'bob', 'submit', { comment: '第一版' });
  assert.equal(w.status, 'submitted'); assert.ok(!f.accounts.alice.get(task.id).status); assert.ok(!f.accounts.bob.get(w.targetId).status);
  await assert.rejects(act(f, w, 'bob', 'approve'), { status: 403 });
  w = await act(f, w, 'alice', 'reject', { comment: '请补充证明' });
  assert.equal(w.status, 'rejected'); assert.equal(w.events.at(-1).comment, '请补充证明');
  assert.ok(!f.accounts.alice.get(task.id).status); assert.ok(!f.accounts.bob.get(w.targetId).status);
  w = await act(f, w, 'bob', 'submit', { comment: '已补充' });
  w = await act(f, w, 'alice', 'approve');
  assert.equal(w.status, 'done'); assert.equal(f.accounts.alice.get(task.id).status, 2); assert.equal(f.accounts.bob.get(w.targetId).status, 2);
  assert.deepEqual(w.events.map(event => event.type), ['claimed', 'submit', 'reject', 'submit', 'approve', 'completed']);
  const restarted = new CollaborationStore(f.dir, f.gateway);
  assert.equal((await restarted.snapshot('alice')).workflows[0].status, 'done');
});

test('public reviewer stays the publisher after another user edits it, board stays until approval', async () => {
  const f = await fixture(), task = await f.create('公共任务');
  await f.store.execute('bob', { id: randomUUID(), action: 'update', source: source(task), fields: { title: '编辑后的任务' } });
  const updated = (await f.store.snapshot('bob')).buffer[0]; assert.equal(updated.publisherId, 'alice');
  let w = await claim(f, updated); assert.equal(w.reviewerId, 'alice'); assert.ok(w.reviewerTaskId);
  assert.equal((await f.store.snapshot('bob')).buffer[0].workflowId, w.id);
  assert.equal(f.accounts.alice.size, 1); assert.equal(f.accounts.bob.size, 1);
  w = await act(f, w, 'bob', 'submit'); w = await act(f, w, 'alice', 'approve');
  assert.equal(w.status, 'done'); assert.equal((await f.store.snapshot('bob')).buffer.length, 0);
  assert.equal((await f.store.revision()).bufferCount, 0);
});

test('publisher claiming own public task creates one task and completes it once', async () => {
  const f = await fixture(), task = await f.create('自己认领'); let completes = 0;
  const complete = f.gateway.complete; f.gateway.complete = async (...args) => { completes++; await complete(...args); };
  let w = await claim(f, task, 'alice'); assert.equal(w.targetId, w.reviewerTaskId); assert.equal(f.counts.creates, 1);
  w = await act(f, w, 'alice', 'submit'); w = await act(f, w, 'alice', 'approve'); assert.equal(w.status, 'done'); assert.equal(completes, 1);
});

test('concurrent claims serialize, command replay is idempotent, IDs cannot be reused with different content', async () => {
  const f = await fixture(), task = await f.create('仅认领一次');
  const results = await Promise.allSettled([claim(f, task, 'alice'), claim(f, task, 'bob')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const f2 = await fixture(), t2 = await personal(f2), command = { id: randomUUID(), action: 'claim', source: source(t2), destination: 'bob' };
  const [w1, w2] = await Promise.all([f2.store.claim('bob', command), f2.store.claim('bob', command)]);
  assert.equal(w1.id, w2.id); assert.equal(f2.counts.creates, 1);
  await assert.rejects(f2.store.claim('alice', command), /编号/);
  const submit = { id: randomUUID(), workflowId: w1.id, version: w1.version, action: 'submit' };
  await f2.store.workflowCommand('bob', submit); const repeated = await f2.store.workflowCommand('bob', submit);
  assert.equal(repeated.events.filter(event => event.type === 'submit').length, 1);
  await assert.rejects(f2.store.workflowCommand('bob', { ...submit, comment: 'changed' }), /编号/);
});

test('provider assigned creation IDs survive restart and failed readback without additional creates', async () => {
  const f = await fixture(), task = await personal(f); let failRead = true;
  f.gateway.create = async (owner, id, fields, receipt) => {
    f.counts.creates++; f.accounts[owner].set('provider-id', { ...fields, id: 'provider-id', projectId: 'inbox-' + owner }); await receipt('provider-id');
    throw new Error('verification unavailable');
  };
  const get = f.gateway.get;
  f.gateway.get = async (owner, id) => { if (id === 'provider-id' && failRead) throw new Error('read unavailable'); return get(owner, id); };
  let w = await claim(f, task); assert.equal(w.status, 'creating'); assert.equal(w.targetId, 'provider-id');
  assert.equal((await f.store.snapshot('bob')).members.find(member => member.id === 'bob').tasks[0].workflowId, w.id);
  failRead = false; f.store = new CollaborationStore(f.dir, f.gateway);
  w = await act(f, w, 'bob', 'retry-workflow'); assert.equal(w.status, 'working'); assert.equal(f.counts.creates, 1);
});

test('lost creation response recovers one new match and never repeats an uncertain create', async () => {
  const f = await fixture(), task = await personal(f);
  f.gateway.create = async (owner, id, fields) => { f.counts.creates++; f.accounts[owner].set('assigned', { ...fields, id: 'assigned', projectId: 'inbox-' + owner }); throw new Error('lost'); };
  let w = await claim(f, task); assert.equal(w.status, 'creating');
  w = await act(f, w, 'bob', 'retry-workflow'); assert.equal(w.status, 'working'); assert.equal(w.targetId, 'assigned'); assert.equal(f.counts.creates, 1);
  const f2 = await fixture(), t2 = await personal(f2); f2.gateway.create = async () => { f2.counts.creates++; throw new Error('unknown'); };
  let pending = await claim(f2, t2); pending = await act(f2, pending, 'bob', 'retry-workflow'); assert.equal(pending.status, 'creating'); assert.equal(f2.counts.creates, 1);
});

test('website completion, edit and delete cannot bypass an active workflow; unrelated task remains usable', async () => {
  const f = await fixture(), task = await personal(f); await claim(f, task);
  for (const owner of ['alice', 'bob']) {
    const owned = (await f.store.snapshot(owner)).members.find(member => member.id === owner).tasks[0];
    for (const action of ['complete', 'delete', 'update']) await assert.rejects(f.store.execute(owner, { id: randomUUID(), action, source: source(owned), fields: { title: 'bypass' } }), /流程/);
    if (owner === 'bob') await assert.rejects(f.store.personalCompletion(owner, owned.id, () => assert.fail('must not complete')), /审批/);
  }
  assert.equal(await f.store.personalCompletion('bob', 'unrelated', async () => 'allowed'), 'allowed');
  await assert.rejects(claim(f, task), /已经有人认领/); assert.equal(f.counts.creates, 1);
});

test('unrelated members cannot complete unclaimed tasks but can edit; original owners and publishers can complete', async () => {
  const f = await fixture(), task = await personal(f), publicTask = await f.create('public');
  for (const item of [task, publicTask]) {
    await assert.rejects(f.store.execute('bob', { id: randomUUID(), action: 'complete', source: source(item) }), { status: 403 });
    await f.store.execute('bob', { id: randomUUID(), action: 'update', source: source(item), fields: { content: '其他成员可以编辑' } });
  }
  assert.ok(!f.accounts.alice.get(task.id).status);
  const updated = await f.store.snapshot('alice');
  await f.store.execute('alice', { id: randomUUID(), action: 'complete', source: source(updated.members.find(member => member.id === 'alice').tasks[0]) });
  await f.store.execute('alice', { id: randomUUID(), action: 'complete', source: source(updated.buffer[0]) });
  assert.equal(f.accounts.alice.get(task.id).status, 2);
  const snapshot = await f.store.snapshot('alice'); assert.equal(snapshot.workflows.length, 0); assert.equal(snapshot.buffer.length, 0);
});

test('completion retries cannot be initiated by unrelated members or replay unauthorized historical pending operations', async () => {
  const f = await fixture(), task = await personal(f); const complete = f.gateway.complete;
  let calls = 0; f.gateway.complete = async () => { calls++; throw new Error('offline'); };
  const command = { id: randomUUID(), action: 'complete', source: source(task) };
  assert.equal((await f.store.execute('alice', command)).status, 'pending');
  await assert.rejects(f.store.resume('bob', command.id), { status: 403 }); assert.equal(calls, 1);
  const file = path.join(f.dir, 'room-collaboration.json'), state = JSON.parse(await readFile(file, 'utf8'));
  state.operations[command.id].actorId = 'bob'; await writeFile(file, JSON.stringify(state));
  await assert.rejects(f.store.resume('alice', command.id), { status: 403 }); assert.equal(calls, 1);
  state.operations[command.id].actorId = 'alice'; await writeFile(file, JSON.stringify(state)); f.gateway.complete = complete;
  assert.equal((await f.store.resume('alice', command.id)).status, 'done');
});

test('original owner or publisher directly completes in working, submitted and rejected states with both inboxes and an event', async () => {
  for (const publicTask of [false, true]) for (const status of ['working', 'submitted', 'rejected']) {
    const f = await fixture(), task = publicTask ? await f.create('public') : await personal(f);
    let w = await claim(f, task);
    if (status !== 'working') w = await act(f, w, 'bob', 'submit');
    if (status === 'rejected') w = await act(f, w, 'alice', 'reject');
    await assert.rejects(act(f, w, 'bob', 'owner-complete'), { status: 403 });
    await assert.rejects(act(f, w, 'offline', 'owner-complete'), { status: 403 });
    const command = { id: randomUUID(), workflowId: w.id, version: w.version, action: 'owner-complete' };
    w = await f.store.workflowCommand('alice', command); assert.equal(w.status, 'done');
    assert.equal(f.accounts.alice.get(publicTask ? w.reviewerTaskId : task.id).status, 2); assert.equal(f.accounts.bob.get(w.targetId).status, 2);
    assert.equal(w.events.filter(event => event.type === 'owner-complete').length, 1);
    assert.equal((await f.store.workflowCommand('alice', command)).events.filter(event => event.type === 'completed').length, 1);
    assert.equal((await f.store.snapshot('bob')).buffer.length, 0);
  }
});

test('sidebar original owner completes linked workflow without calling the ordinary single-task endpoint', async () => {
  const f = await fixture(), task = await personal(f); const w = await claim(f, task);
  await assert.rejects(f.store.personalCompletion('bob', w.targetId, async () => assert.fail('claimant bypass')), /审批/);
  const done = await f.store.personalCompletion('alice', task.id, async () => assert.fail('single-task callback'));
  assert.equal(done.status, 'done'); assert.equal(f.accounts.bob.get(w.targetId).status, 2);
  await f.store.personalCompletion('alice', task.id, async () => assert.fail('duplicate completion after lost HTTP response'));
  // A changed next occurrence remains an ordinary task after the previous workflow ends.
  Object.assign(f.accounts.alice.get(task.id), { status: 0, dueDate: '2026-09-18T00:00:00Z' });
  assert.equal(await f.store.personalCompletion('alice', task.id, async () => 'next occurrence'), 'next occurrence');
});

test('all room members can synchronize workflow details and submitted work requires a new submission', async () => {
  const f = await fixture(), task = await f.create('public'); let w = await claim(f, task);
  w = await act(f, w, 'bob', 'submit'); const oldVersion = w.version;
  await assert.rejects(act(f, w, 'stranger', 'update-workflow', { fields: { title: 'no' } }), { status: 403 });
  w = await act(f, w, 'offline', 'update-workflow', { fields: { title: '新标题', content: '新说明', priority: 5, dueDate: '2026-09-15T12:00:00+0800' } });
  assert.equal(w.status, 'working'); assert.equal(w.editPending, false);
  for (const remote of [f.accounts.alice.get(w.reviewerTaskId), f.accounts.bob.get(w.targetId)]) { assert.equal(remote.title, '新标题'); assert.equal(remote.priority, 5); assert.equal(remote.content, '新说明'); }
  assert.equal((await f.store.snapshot('alice')).buffer[0].title, '新标题');
  await assert.rejects(act(f, w, 'alice', 'approve', { version: oldVersion }), /已更新/);
  await assert.rejects(act(f, w, 'alice', 'approve'), /状态/);
  w = await act(f, w, 'bob', 'submit'); w = await act(f, w, 'alice', 'approve'); assert.equal(w.status, 'done');
  w = await act(f, w, 'bob', 'update-workflow', { fields: { content: '完成后补充' } }); assert.equal(w.status, 'done'); assert.equal(f.accounts.alice.get(w.reviewerTaskId).content, '完成后补充'); assert.equal(f.accounts.bob.get(w.targetId).status, 2);
});

test('lost detail update response resumes after restart without overwriting newer edits or repeating acknowledged writes', async () => {
  const f = await fixture(), task = await personal(f); let w = await claim(f, task), writes = 0;
  const update = f.gateway.update; let fail = true;
  f.gateway.update = async (...args) => { writes++; await update(...args); if (fail) { fail = false; throw new Error('lost update response'); } };
  const command = { id: randomUUID(), workflowId: w.id, version: w.version, action: 'update-workflow', fields: { title: '更新' } };
  w = await f.store.workflowCommand('bob', command); assert.equal(w.editPending, true);
  await assert.rejects(act(f, w, 'bob', 'submit'), /同步/);
  f.store = new CollaborationStore(f.dir, f.gateway);
  w = await f.store.workflowCommand('bob', command); assert.equal(w.editPending, false); assert.equal(writes, 2);
  await f.store.workflowCommand('bob', command); assert.equal(writes, 2);
  // Two editors using the same snapshot cannot silently overwrite one another.
  const results = await Promise.allSettled([act(f, w, 'alice', 'update-workflow', { fields: { content: 'A' } }), act(f, w, 'bob', 'update-workflow', { fields: { content: 'B' } })]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
});

test('details can be saved while creation is uncertain and retried by any member without extra task creation', async () => {
  const f = await fixture(), task = await personal(f); f.loseCreate();
  let w = await claim(f, task); assert.equal(w.status, 'creating');
  w = await act(f, w, 'offline', 'update-workflow', { fields: { content: '新的说明' } });
  assert.equal(w.status, 'working'); assert.equal(w.editPending, false); assert.equal(f.counts.creates, 1); assert.equal(f.accounts.bob.get(w.targetId).content, '新的说明');
});

test('partial completion can be edited and resumed without completing the acknowledged side twice', async () => {
  const f = await fixture(), task = await personal(f); let w = await claim(f, task); const complete = f.gateway.complete;
  let failed = false, sourceCalls = 0;
  f.gateway.complete = async (owner, id) => { if (owner === 'alice') sourceCalls++; if (owner === 'bob' && !failed) { failed = true; throw new Error('offline'); } return complete(owner, id); };
  w = await act(f, w, 'alice', 'owner-complete'); assert.equal(w.status, 'approving');
  w = await act(f, w, 'bob', 'update-workflow', { fields: { content: '更新后的说明' } }); assert.equal(w.editPending, false);
  w = await act(f, w, 'alice', 'owner-complete'); assert.equal(w.status, 'done'); assert.equal(sourceCalls, 1); assert.equal(f.accounts.bob.get(w.targetId).content, '更新后的说明');
});

test('changing repeat settings cannot bypass protection after an uncertain recurring completion', async () => {
  const f = await fixture(), task = await personal(f, { repeatFlag: 'RRULE:FREQ=DAILY' }); let w = await claim(f, task), calls = 0;
  f.gateway.complete = async () => { calls++; throw new Error('unknown completion result'); };
  w = await act(f, w, 'alice', 'owner-complete'); assert.equal(w.status, 'approving');
  w = await act(f, w, 'bob', 'update-workflow', { fields: { repeatFlag: '' } }); assert.equal(w.editPending, false);
  w = await act(f, w, 'alice', 'owner-complete'); assert.equal(w.status, 'approving'); assert.match(w.error, /重复任务/); assert.equal(calls, 1);
});

test('explicit new settings can resolve a detail sync conflict while stale requests stay rejected', async () => {
  const f = await fixture(), task = await personal(f); let w = await claim(f, task); const update = f.gateway.update; let first = true;
  f.gateway.update = async (...args) => { if (first) { first = false; f.accounts.bob.get(w.targetId).content = '外部修改'; throw new Error('connection interrupted'); } await update(...args); };
  w = await act(f, w, 'alice', 'update-workflow', { fields: { content: '第一次修改' } }); assert.equal(w.editPending, true);
  w = await act(f, w, 'bob', 'retry-workflow'); assert.equal(w.editPending, true); assert.match(w.error, /同步期间被修改/);
  w = await act(f, w, 'bob', 'update-workflow', { fields: { content: '核对后的修改' } }); assert.equal(w.editPending, false);
  assert.equal(f.accounts.alice.get(task.id).content, '核对后的修改'); assert.equal(f.accounts.bob.get(w.targetId).content, '核对后的修改');
  assert.ok(w.events.some(event => event.type === 'update-replaced'));
});

test('stale approvals and out of workflow manual completions are rejected without polling or reopening', async () => {
  const f = await fixture(), task = await personal(f); let w = await claim(f, task); w = await act(f, w, 'bob', 'submit');
  f.accounts.bob.get(w.targetId).title = 'changed externally';
  await assert.rejects(act(f, w, 'alice', 'approve'), /发生变化/); assert.ok(!f.accounts.alice.get(task.id).status);
  w = await act(f, w, 'alice', 'reject'); f.accounts.bob.get(w.targetId).status = 2;
  await assert.rejects(act(f, w, 'bob', 'submit'), /流程外/); assert.equal(f.accounts.bob.get(w.targetId).status, 2);
  await assert.rejects(act(f, { ...w, version: w.version - 1 }, 'bob', 'submit'), /已更新/);
});

test('approval resumes partial success after restart without completing acknowledged side twice', async () => {
  const f = await fixture(), task = await personal(f); let w = await claim(f, task); w = await act(f, w, 'bob', 'submit');
  const completes = [], complete = f.gateway.complete; let fail = true;
  f.gateway.complete = async (owner, id) => { completes.push(owner); if (owner === 'bob' && fail) throw new Error('offline'); await complete(owner, id); };
  w = await act(f, w, 'alice', 'approve'); assert.equal(w.status, 'approving'); assert.equal(f.accounts.alice.get(task.id).status, 2);
  fail = false; f.store = new CollaborationStore(f.dir, f.gateway); w = await act(f, w, 'alice', 'retry-workflow');
  assert.equal(w.status, 'done'); assert.deepEqual(completes, ['alice', 'bob', 'bob']);
});

test('lost completion response is read back, but ambiguous recurring completion is never repeated', async () => {
  for (const recurring of [false, true]) {
    const f = await fixture(), task = await personal(f, recurring ? { repeatFlag: 'RRULE:FREQ=DAILY' } : {}); let w = await claim(f, task); w = await act(f, w, 'bob', 'submit');
    let count = 0; const complete = f.gateway.complete;
    f.gateway.complete = async (owner, id) => { count++; if (owner === 'alice') { if (!recurring) await complete(owner, id); throw new Error('lost response'); } await complete(owner, id); };
    w = await act(f, w, 'alice', 'approve'); w = await act(f, w, 'alice', 'retry-workflow');
    assert.equal(w.status, recurring ? 'approving' : 'done'); assert.equal(count, recurring ? 1 : 2);
  }
});

test('attachments are scoped to workflow and uploader; drafts are private and rejection files become shared', async () => {
  const f = await fixture(), task = await personal(f); let w = await claim(f, task); w = await act(f, w, 'bob', 'submit');
  const id = randomUUID(); await mkdir(path.join(f.dir, 'workflow-files')); await writeFile(path.join(f.dir, 'workflow-files', id + '.json'), JSON.stringify({ id, workflowId: w.id, actorId: 'alice', name: '评语.txt', size: 10 }));
  await assert.rejects(f.store.attachmentAccess('bob', w.id, false, { id, actorId: 'alice' }), { status: 403 });
  await assert.rejects(f.store.attachmentAccess('bob', w.id, true), { status: 403 });
  w = await act(f, w, 'alice', 'reject', { comment: '参考附件', attachments: [id] }); assert.equal(w.events.at(-1).files[0].name, '评语.txt');
  await f.store.attachmentAccess('bob', w.id, false, { id, actorId: 'alice' });
  await assert.rejects(act(f, w, 'bob', 'submit', { attachments: [id] }), { status: 403 });
  await assert.rejects(act(f, w, 'bob', 'submit', { attachments: Array(11).fill(id) }), { status: 400 });
  await assert.rejects(f.store.attachmentAccess('stranger', w.id), { status: 403 });
});

async function legacy(f, task, targetId, extra = {}) {
  const id = randomUUID(), file = path.join(f.dir, 'room-collaboration.json');
  const state = { version: 1, revision: 0, buffer: {}, operations: { [id]: { id, actorId: 'bob', action: 'move', title: task.title, from: 'alice', to: 'bob', source: source(task), targetId, fields: taskFields(task), status: 'pending', phase: 'prepared', error: '', updatedAt: Date.now(), ...extra } } };
  await writeFile(file, JSON.stringify(state)); return id;
}
test('legacy reset deletes transfer records idempotently while preserving inbox tasks', async () => {
  const f = await fixture(), task = await personal(f); f.accounts.bob.set('known', { ...taskFields(task), id: 'known', projectId: 'inbox-bob' }); await legacy(f, task, 'known');
  assert.deepEqual((await f.store.resetLegacy('alice')).issues, []); assert.equal(f.accounts.alice.size, 1); assert.equal(f.accounts.bob.size, 1);
  assert.equal((await f.store.snapshot('alice')).operations.length, 0); await f.store.resetLegacy('bob'); assert.equal(f.counts.removes, 0);
});
test('legacy reset never infers missing created IDs from a matching title, and protects changed or missing-source tasks', async () => {
  for (const scenario of ['unknown-id', 'changed', 'missing-source']) {
    const f = await fixture(), task = await personal(f); f.accounts.bob.set('known', { ...taskFields(task), id: 'known', projectId: 'inbox-bob' });
    await legacy(f, task, scenario === 'unknown-id' ? 'old-random-id' : 'known');
    if (scenario === 'changed') f.accounts.bob.get('known').title = 'user edited';
    if (scenario === 'missing-source') f.accounts.alice.clear();
    const result = await f.store.resetLegacy('alice'); assert.equal(result.issues.length, 0); assert.equal(f.accounts.bob.size, 1); assert.equal(f.counts.removes, 0);
    assert.equal((await f.store.snapshot('alice')).operations.length, 0);
  }
});
test('legacy destructive routes stay disabled and public edits reject stale or invalid fields', async () => {
  const f = await fixture(), task = await f.create('编辑');
  await assert.rejects(f.store.execute('alice', { id: randomUUID(), action: 'move', source: source(task), destination: 'bob' }), /认领审批/);
  await f.store.execute('bob', { id: randomUUID(), action: 'update', source: source(task), fields: { title: '新标题' } });
  await assert.rejects(f.store.execute('alice', { id: randomUUID(), action: 'delete', source: source(task) }), /已被修改/);
  await assert.rejects(f.store.execute('alice', { id: randomUUID(), action: 'create', fields: { title: 'x', token: 'forbidden' } }), { status: 400 });
  await assert.rejects(f.store.execute('stranger', { id: randomUUID(), action: 'create', fields: { title: 'x' } }), { status: 403 });
});
