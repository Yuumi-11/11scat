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
    reopen: async (owner, before) => { const task = accounts[owner].get(before.id); task.status = 0; task.completedTime = null; return structuredClone(task); },
    checkTransfer: async () => {},
  };
  const store = new CollaborationStore(dir, gateway);
  const create = async title => { await store.execute('alice', { id: randomUUID(), action: 'create', fields: { title, priority: 3 } }); return (await store.snapshot('alice')).buffer.find(task => task.title === title); };
  return { dir, gateway, store, create, accounts, counts, loseCreate: () => { loseCreate = true; }, loseDelete: () => { loseDelete = true; }, afterCreate: fn => { afterCreate = fn; } };
}
const source = task => ({ ownerId: task.ownerId, taskId: task.id, version: task.version });

async function preceding(f, owner = 'bob') {
  f.accounts[owner].set('preceding', { id: 'preceding', projectId: 'inbox-' + owner, ...taskFields({ title: '前一条待办', dueDate: '2026-10-01T01:30:00+0800' }) });
  return (await f.store.snapshot(owner)).members.find(member => member.id === owner).tasks.find(task => task.id === 'preceding');
}

test('same-owner date drops persist and stale, wrong-owner or self references leave tasks unchanged', async () => {
  const f = await fixture(), task = await personal(f, { dueDate: '2026-09-01T08:00:00Z', startDate: '2026-08-31T08:00:00Z', isAllDay: false });
  const previous = await preceding(f, 'alice');
  const command = { id: randomUUID(), action: 'update', source: source(task), fields: {}, dateAfter: source(previous) };
  for (const dateAfter of [{ ...source(previous), version: 'old' }, { ...source(previous), ownerId: 'bob' }, source(task)]) {
    await assert.rejects(f.store.execute('alice', { ...command, id: randomUUID(), dateAfter }), /参照|已变化/);
    assert.equal(f.accounts.alice.get(task.id).dueDate, task.dueDate);
  }
  assert.equal((await f.store.execute('alice', command)).status, 'done');
  assert.equal(f.accounts.alice.get(task.id).dueDate, '2026-10-01T08:00:00.000Z');
  assert.equal(f.accounts.alice.get(task.id).startDate, '2026-09-30T08:00:00.000Z');
  assert.equal(f.accounts.alice.get(task.id).isAllDay, false);
  assert.equal((await f.store.execute('alice', command)).status, 'done');
});

test('claims onto a dated predecessor synchronize public and personal sources and survive response loss', async () => {
  for (const publicTask of [false, true]) {
    const f = await fixture(), task = publicTask ? await f.create('拖动公共任务') : await personal(f, { dueDate: '2026-09-01T08:00:00Z', isAllDay: false });
    const previous = await preceding(f);
    const command = { id: randomUUID(), action: 'claim', source: source(task), destination: 'bob', dateAfter: source(previous) };
    const update = f.gateway.update; let lose = true;
    f.gateway.update = async (...args) => { await update(...args); if (lose) { lose = false; throw new Error('lost date-update response'); } };
    let w = await f.store.claim('bob', command);
    assert.ok(w.error); assert.ok(w.editPending);
    f.store = new CollaborationStore(f.dir, f.gateway);
    w = await f.store.claim('bob', command);
    assert.equal(w.status, 'working'); assert.equal(w.error, ''); assert.equal(w.editPending, false);
    const expected = publicTask ? '2026-09-30T16:00:00.000Z' : '2026-10-01T08:00:00.000Z';
    assert.equal(w.fields.dueDate, expected);
    assert.equal(f.accounts.bob.get(w.targetId).dueDate, expected);
    if (publicTask) assert.equal((await f.store.snapshot('alice')).buffer.find(item => item.id === task.id).dueDate, expected);
    else assert.equal(f.accounts.alice.get(task.id).dueDate, expected);
    assert.equal(f.counts.creates, 1);
    assert.equal((await f.store.claim('bob', command)).id, w.id);
  }
});

test('collecting own public task applies predecessor date and remains an ordinary inbox task', async () => {
  const f = await fixture(), task = await f.create('自己的公共任务'), previous = await preceding(f, 'alice');
  const command = { id: randomUUID(), action: 'claim', source: source(task), destination: 'alice', dateAfter: source(previous) };
  const w = await f.store.claim('alice', command);
  assert.equal(w.status, 'done'); assert.equal(w.error, ''); assert.equal(w.editPending, false);
  const snapshot = await f.store.snapshot('alice');
  assert.ok(!snapshot.buffer.some(item => item.id === task.id));
  const collected = snapshot.members.find(member => member.id === 'alice').tasks.find(item => item.id === w.targetId);
  assert.equal(collected.dueDate, '2026-09-30T16:00:00.000Z'); assert.equal(collected.workflowId, undefined);
  assert.equal((await f.store.claim('alice', command)).status, 'done'); assert.equal(f.counts.creates, 1);
});

test('invalid claim predecessors are rejected before any task is created', async () => {
  const f = await fixture(), task = await f.create('保留公共任务'), previous = await preceding(f);
  const command = { id: randomUUID(), action: 'claim', source: source(task), destination: 'bob', dateAfter: source(previous) };
  f.accounts.bob.get(previous.id).dueDate = null;
  await assert.rejects(f.store.claim('bob', command), /前一条待办已变化/);
  assert.equal(f.counts.creates, 0);
  assert.ok((await f.store.snapshot('alice')).buffer.some(item => item.id === task.id));
});

test('lightweight task notices expose active IDs without querying external inboxes', async () => {
  const f = await fixture();
  const a = await f.create('first'), b = await f.create('second');
  const before = await f.store.revision();
  assert.deepEqual(new Set(before.bufferIds), new Set([a.id, b.id]));
  assert.deepEqual(before.bufferPreview, [{ id: a.id, title: 'first' }, { id: b.id, title: 'second' }]);
  await f.store.execute('alice', { id: randomUUID(), action: 'update', source: source(a), fields: { title: 'edited title' } });
  assert.deepEqual((await f.store.revision()).bufferIds, before.bufferIds);
  await f.store.execute('alice', { id: randomUUID(), action: 'complete', source: source(b) });
  const c = await f.create('replacement');
  f.gateway.inbox = async () => { throw new Error('must not query Dida for a badge'); };
  const after = await f.store.revision();
  assert.equal(after.bufferCount, before.bufferCount);
  assert.deepEqual(new Set(after.bufferIds), new Set([a.id, c.id]));
  assert.deepEqual(after.bufferPreview, [{ id: a.id, title: 'edited title' }, { id: c.id, title: 'replacement' }]);
  const file = path.join(f.dir, 'room-collaboration.json'), state = JSON.parse(await readFile(file, 'utf8'));
  state.buffer[a.id].stagedBy = 'pending'; state.buffer[c.id].completedAt = Date.now();
  await writeFile(file, JSON.stringify(state));
  assert.deepEqual((await f.store.revision()).bufferIds, []);
  assert.deepEqual((await f.store.revision()).bufferPreview, []);
});

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
const refreshed = async (f, id) => (await f.store.snapshot('alice')).workflows.find(workflow => workflow.id === id);

test('either participant deletes exact linked tasks and archives every stage with original history', async () => {
  for (const status of ['creating','working','submitted','rejected','approving','done']) for(const actor of ['alice','bob']) {
    const f=await fixture(), task=await personal(f); let w=await claim(f,task);
    const file=path.join(f.dir,'room-collaboration.json'),state=JSON.parse(await readFile(file,'utf8'));
    state.workflows[w.id].status=status;
    state.workflows[w.id].events.push({id:randomUUID(),actorId:'bob',type:'submit',at:Date.now(),comment:'保留结果',files:[]});
    await writeFile(file,JSON.stringify(state));
    const command={id:randomUUID(),workflowId:w.id,version:w.version,action:actor==='alice'?'delete-owner-task':'delete-claimed-task'};
    await assert.rejects(f.store.workflowCommand(actor==='alice'?'bob':'alice',command),{status:403});
    w=await f.store.workflowCommand(actor,command);
    assert.equal(w.status,'deleted');assert.equal(w.error,'');
    assert.equal(f.accounts.alice.size,0);assert.equal(f.accounts.bob.size,0);
    assert.equal(w.events.find(event=>event.type==='submit').comment,'保留结果');
    assert.ok(w.events.some(event=>event.type==='task-deleted'));
    await f.store.workflowCommand(actor,command);assert.equal(f.counts.removes,2);
    await f.store.recoverPendingWorkflows();assert.equal(f.counts.creates,1);
    assert.equal((await refreshed(f,w.id)).status,'deleted');
    for(const action of ['update-workflow','restore-workflow','owner-complete','nudge']) await assert.rejects(act(f,w,actor,action),/已删除/);
  }
});

test('public deletion skips absent publisher task, preserves history and removes the public card', async()=>{
  const f=await fixture(),task=await f.create('仅公共任务');let w=await claim(f,task);
  w=await act(f,w,'bob','submit',{comment:'归档材料'});
  w=await act(f,w,'alice','delete-owner-task');
  assert.equal(w.status,'deleted');assert.equal(w.error,'');assert.equal(f.accounts.alice.size,0);assert.equal(f.accounts.bob.size,0);
  assert.equal(f.counts.removes,1);assert.equal(f.counts.creates,1);
  assert.equal((await f.store.snapshot('alice')).buffer.length,0);
  assert.equal((await f.store.revision()).bufferCount,0);
  assert.equal(w.events.find(event=>event.type==='submit').comment,'归档材料');
});

test('partial deletion automatically resumes after restart without duplicate deletes or task resurrection',async()=>{
  const f=await fixture(),task=await personal(f);let w=await claim(f,task);
  f.loseDelete();w=await act(f,w,'alice','delete-owner-task');assert.ok(w.ownerDeletePending);
  assert.equal(f.accounts.alice.size,0);assert.equal(f.accounts.bob.size,1);
  f.store=new CollaborationStore(f.dir,f.gateway);
  await f.store.recoverPendingWorkflows();w=await refreshed(f,w.id);
  assert.equal(w.status,'deleted');assert.equal(w.error,'');assert.ok(!w.ownerDeletePending);
  assert.equal(f.accounts.bob.size,0);assert.equal(f.counts.removes,2);
  await f.store.recoverPendingWorkflows();assert.equal(f.counts.removes,2);
});

test('archived deletion suppresses a stale public card after restart without touching remote tasks',async()=>{
  const f=await fixture(),task=await f.create('不得重现的便签');let w=await claim(f,task);
  const file=path.join(f.dir,'room-collaboration.json'),before=JSON.parse(await readFile(file,'utf8')).buffer[task.id];
  w=await act(f,w,'alice','delete-owner-task');assert.equal(w.status,'deleted');
  const saved=JSON.parse(await readFile(file,'utf8'));saved.buffer[task.id]=before;
  await writeFile(file,JSON.stringify(saved));
  const reopened=new CollaborationStore(f.dir,f.gateway),removes=f.counts.removes;
  assert.equal((await reopened.revision('alice')).bufferCount,0);
  assert.deepEqual((await reopened.revision('alice')).bufferPreview,[]);
  const snapshot=await reopened.snapshot('alice');assert.equal(snapshot.buffer.length,0);
  assert.equal(snapshot.workflows.find(item=>item.id===w.id).status,'deleted');
  assert.equal(f.counts.removes,removes);
});

test('public deletion persists card removal before provider confirmation and repairs old pending cards on restart', async () => {
  const f = await fixture(), task = await f.create('待核对删除'), other = await f.create('保留便签');
  let w = await claim(f, task);
  w = await act(f, w, 'bob', 'submit', { comment: '保留提交记录' });
  const file = path.join(f.dir, 'room-collaboration.json');
  const before = JSON.parse(await readFile(file, 'utf8')).buffer[task.id];
  const remove = f.gateway.remove;
  let attempts = 0;
  f.gateway.remove = async () => {
    attempts++;
    assert.equal(JSON.parse(await readFile(file, 'utf8')).buffer[task.id], undefined, 'removal is durable before the external call finishes');
    assert.deepEqual((await f.store.revision()).bufferIds, [other.id]);
    throw new Error('provider unavailable');
  };
  w = await act(f, w, 'alice', 'delete-owner-task');
  assert.equal(w.ownerDeletePending, true);
  assert.equal(w.status, 'submitted');
  assert.equal(f.accounts.bob.has(w.targetId), true, 'an unconfirmed inbox deletion is not reported as complete');
  const pending = JSON.parse(await readFile(file, 'utf8'));
  pending.buffer[task.id] = before;
  await writeFile(file, JSON.stringify(pending));
  f.store = new CollaborationStore(f.dir, f.gateway);
  assert.deepEqual((await f.store.revision()).bufferPreview, [{ id: other.id, title: other.title }]);
  const snapshot = await f.store.snapshot('alice');
  assert.deepEqual(snapshot.buffer.map(item => item.id), [other.id]);
  assert.ok(snapshot.members.find(member => member.id === 'bob').tasks.some(item => item.id === w.targetId));
  assert.equal(snapshot.workflows.find(item => item.id === w.id).events.find(event => event.type === 'submit').comment, '保留提交记录');
  assert.equal(attempts, 1, 'reading repaired cards does not perform another external deletion');
  assert.equal(f.counts.removes, 0);
  f.gateway.remove = remove;
  await f.store.recoverPendingWorkflows();
  w = await refreshed(f, w.id);
  assert.equal(w.status, 'deleted');
  assert.equal(f.counts.removes, 1);
  assert.equal(f.counts.creates, 1, 'recovery never recreates the removed public card or inbox task');
  assert.deepEqual((await f.store.revision()).bufferIds, [other.id]);
});

test('old one-sided deletion receipts do not remove a public card or another member task', async () => {
  for (const eventType of ['owner-task-deleted', 'claimant-task-deleted']) {
    const f = await fixture(), task = await f.create('旧版单侧删除');
    const w = await claim(f, task), id = randomUUID();
    const file = path.join(f.dir, 'room-collaboration.json'), state = JSON.parse(await readFile(file, 'utf8'));
    state.workflows[w.id].ownerDeletion = { id };
    state.workflows[w.id].events.push({ id, type: eventType, actorId: 'alice', at: Date.now(), comment: '', files: [] });
    await writeFile(file, JSON.stringify(state));
    const reopened = new CollaborationStore(f.dir, f.gateway);
    assert.deepEqual((await reopened.revision()).bufferIds, [task.id]);
    await reopened.recoverPendingWorkflows();
    const snapshot = await reopened.snapshot('alice');
    assert.deepEqual(snapshot.buffer.map(item => item.id), [task.id]);
    assert.ok(f.accounts.bob.has(w.targetId));
    assert.equal(f.counts.removes, 0);
  }
});

test('deletion uses exact relocated links and protects a later recurring occurrence',async()=>{
  const f=await fixture(),task=await personal(f);let w=await claim(f,task);
  f.accounts.alice.get(task.id).projectId='other-project';
  const remove=f.gateway.remove;
  f.gateway.remove=async(owner,id,project)=>{if(owner==='alice'){assert.equal(id,task.id);assert.equal(project,'other-project');}await remove(owner,id);};
  w=await act(f,w,'alice','delete-owner-task');assert.equal(w.error,'');assert.equal(f.counts.removes,2);
  const g=await fixture(),repeated=await personal(g,{repeatFlag:'RRULE:FREQ=DAILY;INTERVAL=1',dueDate:'2026-09-10T12:00:00+0800'});
  let recurring=await claim(g,repeated);g.accounts.alice.get(repeated.id).dueDate='2026-09-11T12:00:00+0800';
  recurring=await act(g,recurring,'alice','delete-owner-task');assert.match(recurring.error,/其他日期/);assert.equal(g.counts.removes,0);
});

test('deletion cancels pending creation and editing without later recreation',async()=>{
  for(const stage of ['creating','editing']){
    const f=await fixture(),task=await f.create('取消流程');
    if(stage==='creating')f.loseCreate();
    let w=await claim(f,task);
    if(stage==='editing'){f.gateway.update=async()=>{throw new Error('offline');};w=await act(f,w,'alice','update-workflow',{fields:{content:'待同步'}});assert.ok(w.editPending);}
    w=await act(f,w,'alice','delete-owner-task');assert.equal(w.status,'deleted');assert.ok(!w.editPending);
    await f.store.recoverPendingWorkflows();assert.equal(f.accounts.bob.size,0);assert.equal(f.counts.creates,1);
  }
});

test('background recovery finishes saved edits and backs off repeated failures',async()=>{
  const f=await fixture(),task=await f.create('自动同步');let w=await claim(f,task),calls=0;
  const update=f.gateway.update;f.gateway.update=async()=>{calls++;throw new Error('offline');};
  w=await act(f,w,'alice','update-workflow',{fields:{title:'已保存修改'}});assert.ok(w.editPending);
  await f.store.recoverPendingWorkflows();const after=calls;
  await f.store.recoverPendingWorkflows();assert.equal(calls,after);
  const file=path.join(f.dir,'room-collaboration.json'),state=JSON.parse(await readFile(file,'utf8'));state.workflows[w.id].syncRetryAt=0;await writeFile(file,JSON.stringify(state));
  f.gateway.update=update;f.store=new CollaborationStore(f.dir,f.gateway);
  await f.store.recoverPendingWorkflows();w=await refreshed(f,w.id);assert.ok(!w.editPending);assert.equal(w.title,'已保存修改');
  assert.equal(f.accounts.bob.get(w.targetId).title,w.title);assert.equal(f.counts.creates,1);
});

test('absent original tasks do not block submit, approval or direct completion and are never recreated', async () => {
  for (const deletionTime of ['before-submit', 'after-submit', 'direct']) {
    const f = await fixture(), task = await personal(f); let w = await claim(f, task);
    if (deletionTime === 'after-submit') w = await act(f, w, 'bob', 'submit');
    f.accounts.alice.delete(task.id);
    w = await refreshed(f, w.id); assert.ok(!w.taskAnomaly);
    if (deletionTime === 'before-submit') w = await act(f, w, 'bob', 'submit');
    w = await act(f, w, 'alice', deletionTime === 'direct' ? 'owner-complete' : 'approve');
    assert.equal(w.status, 'done'); assert.equal(f.accounts.alice.size, 0);
    assert.equal(f.accounts.bob.get(w.targetId).status, 2); assert.equal(f.counts.creates, 1);
  }
});

test('missing publisher lookup failures pause approval without inventing absence or completing claimant', async () => {
  const f = await fixture(), task = await personal(f); let w = await claim(f, task);
  w = await act(f, w, 'bob', 'submit');
  const get = f.gateway.get;
  f.gateway.get = async (owner, id) => { if (owner === 'alice') throw new Error('network unavailable'); return get(owner, id); };
  await assert.rejects(act(f, w, 'alice', 'approve'), /network unavailable/);
  assert.ok(!f.accounts.bob.get(w.targetId).status); assert.equal(f.counts.creates, 1);
});

test('missing claimant task is restored without resetting submitted review or losing results', async () => {
  const f = await fixture(), task = await personal(f, { dueDate: '2026-09-12T12:00:00+0800', tags: ['exam'], reminders: ['TRIGGER:-PT15M'], priority: 5 });
  let w = await claim(f, task);
  const fileId = randomUUID(); await mkdir(path.join(f.dir, 'workflow-files'), { recursive: true });
  await writeFile(path.join(f.dir, 'workflow-files', `${fileId}.json`), JSON.stringify({ workflowId: w.id, actorId: 'bob', name: 'solution.pdf', size: 321 }));
  w = await act(f, w, 'bob', 'submit', { comment: '解题结果已提交', attachments: [fileId] });
  const original = structuredClone(f.accounts.alice.get(task.id)), oldTarget = w.targetId;
  f.accounts.bob.delete(oldTarget);
  w = await refreshed(f, w.id);
  assert.equal(w.taskAnomaly, true); assert.equal(w.status, 'submitted');
  const version = w.version;
  w = await refreshed(f, w.id);
  assert.equal(w.version, version, 'unchanged anomaly refreshes do not generate events or revisions');
  assert.equal(w.events.filter(event => event.type === 'task-anomaly').length, 1);
  await assert.rejects(act(f, w, 'offline', 'restore-workflow'), { status: 403 });
  w = await act(f, w, 'bob', 'restore-workflow');
  assert.equal(w.taskAnomaly, false); assert.equal(w.status, 'submitted'); assert.notEqual(w.targetId, oldTarget);
  assert.equal(w.events.find(event => event.type === 'submit').comment, '解题结果已提交');
  assert.equal(w.events.find(event => event.type === 'submit').files[0].id, fileId);
  assert.deepEqual(f.accounts.alice.get(task.id), original, 'surviving original is untouched');
  assert.deepEqual(taskFields(f.accounts.bob.get(w.targetId)), w.fields);
  w = await act(f, w, 'alice', 'approve');
  assert.equal(w.status, 'done'); assert.equal(f.accounts.bob.get(w.targetId).status, 2);
});

test('recovery of the public claimant task never creates a publisher task and survives a lost creation response and a store restart', async () => {
  const f = await fixture(), publicTask = await f.create('公共发布任务');
  let w = await claim(f, publicTask);
  f.accounts.alice.delete(w.reviewerTaskId); f.accounts.bob.delete(w.targetId);
  w = await refreshed(f, w.id);
  f.loseCreate();
  const command = { id: randomUUID(), workflowId: w.id, version: w.version, action: 'restore-workflow' };
  w = await f.store.workflowCommand('alice', command);
  assert.ok(w.syncError); assert.equal(w.status, 'working'); assert.equal(f.accounts.alice.size, 0);
  f.store = new CollaborationStore(f.dir, f.gateway);
  w = await f.store.workflowCommand('alice', command);
  assert.equal(w.taskAnomaly, false); assert.equal(w.status, 'working');
  assert.equal(f.accounts.alice.size, 0); assert.equal(f.accounts.bob.size, 1); assert.equal(f.counts.creates, 2);
  await f.store.workflowCommand('alice', command);
  assert.equal(f.counts.creates, 2, 'successful restoration replay is idempotent');
  assert.equal((await f.store.snapshot('alice')).buffer[0].id, publicTask.id);
  f.accounts.bob.delete(w.targetId); w = await refreshed(f, w.id);
  await f.store.workflowCommand('alice', command);
  assert.equal(f.counts.creates, 2, 'old restoration request cannot restore a later anomaly');
});

test('surviving task external edits allow approval after counterpart restoration', async () => {
  const f = await fixture(), task = await personal(f);
  let w = await claim(f, task); w = await act(f, w, 'bob', 'submit', { comment: 'original result' });
  f.accounts.alice.get(task.id).title = '滴答中修改后的要求'; f.accounts.bob.delete(w.targetId);
  w = await refreshed(f, w.id); w = await act(f, w, 'bob', 'restore-workflow');
  assert.equal(w.status, 'submitted');
  w = await act(f, w, 'alice', 'approve');
  assert.equal(w.status, 'done');
  assert.equal(f.accounts.alice.get(task.id).title, '滴答中修改后的要求');
  assert.equal(f.accounts.alice.get(task.id).status, 2);
  assert.equal(f.accounts.bob.get(w.targetId).status, 2);
});

test('account and detail errors never mark tasks missing or create replacements', async () => {
  const f = await fixture(), task = await personal(f); let w = await claim(f, task);
  const inbox = f.gateway.inbox, get = f.gateway.get;
  f.gateway.inbox = async owner => { if (owner === 'bob') throw new Error('authorization expired'); return inbox(owner); };
  w = await refreshed(f, w.id); assert.ok(w.syncError); assert.ok(!w.taskAnomaly); assert.equal(f.counts.creates, 1);
  f.gateway.inbox = inbox; f.accounts.bob.delete(w.targetId);
  f.gateway.get = async (owner, id) => { if (owner === 'bob') throw new Error('timeout'); return get(owner, id); };
  w = await refreshed(f, w.id); assert.match(w.syncError, /timeout/); assert.ok(!w.taskAnomaly);
  f.gateway.get = get; w = await refreshed(f, w.id); assert.equal(w.taskAnomaly, true);
  f.gateway.inbox = async owner => { if (owner === 'alice') throw new Error('offline'); return inbox(owner); };
  w = await act(f, w, 'bob', 'restore-workflow'); assert.match(w.syncError, /offline/); assert.equal(f.counts.creates, 1);
});

test('normal inbox tasks, self collections and archived workflows do not trigger linked detail checks', async () => {
  const f = await fixture(); await personal(f); const board = await f.create('自己的任务'); await claim(f, board, 'alice');
  let w = await claim(f, await f.create('已结束')); w = await act(f, w, 'alice', 'owner-complete'); assert.equal(w.status, 'done');
  let calls = 0; f.gateway.get = async () => { calls++; throw new Error('unexpected'); };
  await f.store.snapshot('bob'); assert.equal(calls, 0);
});

test('present active workflow tasks reuse inbox data without extra detail lookups', async () => {
  const f = await fixture(), task = await personal(f); await claim(f, task);
  let calls = 0; f.gateway.get = async () => { calls++; throw new Error('unexpected'); };
  await f.store.snapshot('alice'); assert.equal(calls, 0);
});

test('moved task association is saved and later workflow edits use its discovered project', async () => {
  const f = await fixture(), task = await personal(f); let w = await claim(f, task);
  f.accounts.alice.get(task.id).projectId = 'new-list';
  const inbox = f.gateway.inbox, update = f.gateway.update;
  f.gateway.inbox = async owner => { const data = await inbox(owner); data.tasks = data.tasks.filter(task => task.projectId === data.projectId); return data; };
  f.gateway.locate = f.gateway.get;
  w = await refreshed(f, w.id); assert.ok(!w.taskAnomaly); assert.equal(w.events.filter(event => event.type === 'task-relocated').length, 1);
  let project;
  f.gateway.update = async (owner, id, fields, version, projectId) => { if (owner === 'alice') project = projectId; await update(owner, id, fields, version); };
  w = await act(f, w, 'offline', 'update-workflow', { fields: { title: '继续编辑' } });
  assert.equal(project, 'new-list'); assert.equal(w.error, ''); assert.equal(f.counts.creates, 1);
});

test('concurrent restorations cannot create duplicate replacements', async () => {
  const f = await fixture(), task = await personal(f); let w = await claim(f, task);
  f.accounts.bob.delete(w.targetId); w = await refreshed(f, w.id);
  const results = await Promise.allSettled([act(f, w, 'bob', 'restore-workflow'), act(f, w, 'alice', 'restore-workflow')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(f.accounts.bob.size, 1); assert.equal(f.counts.creates, 2);
});

test('completed claimant task is reopened without replacement or automatic approval', async () => {
  const f = await fixture(), task = await personal(f); let w = await claim(f, task);
  f.accounts.bob.get(w.targetId).status = 2;
  const inbox = f.gateway.inbox;
  f.gateway.inbox = async owner => { const data = await inbox(owner); data.tasks = data.tasks.filter(task => !task.status); return data; };
  w = await refreshed(f, w.id);
  assert.equal(w.status, 'working'); assert.ok(!w.taskAnomaly); assert.equal(f.counts.creates, 1);
  assert.equal(f.accounts.bob.get(w.targetId).status, 0); assert.ok(w.needsSubmission);
  assert.ok((await f.store.snapshot('bob')).members.find(member => member.id === 'bob').tasks.some(task => task.id === w.targetId));
});

test('public and workflow unread records are per member, persist across devices and never query Dida on acknowledgement', async () => {
  const f = await fixture(), board = await f.create('通知测试');
  assert.equal((await f.store.revision('alice')).notices.length, 0);
  const publicNotice = (await f.store.revision('bob')).notices[0]; assert.equal(publicNotice.taskId, board.id);
  let w = await claim(f, board);
  w = await act(f, w, 'alice', 'nudge');
  let notices = (await f.store.revision('bob')).notices;
  assert.equal(notices.length, 2); assert.equal(notices.filter(item => item.eventType === 'nudge').length, 1);
  f.gateway.inbox = async () => { throw new Error('notification reads must not query Dida'); };
  f.gateway.get = async () => { throw new Error('notification reads must not query Dida'); };
  const revision = (await f.store.revision()).revision;
  const noticesBefore = (await f.store.revision('bob')).noticeVersion;
  await f.store.markNoticesRead('bob', [publicNotice.id]);
  const noticesAfter = (await f.store.revision('bob')).noticeVersion;
  assert.ok(noticesAfter > noticesBefore, 'browser can reject stale notification snapshots');
  await f.store.markNoticesRead('bob', [publicNotice.id]);
  assert.equal((await f.store.revision('bob')).noticeVersion, noticesAfter);
  notices = (await f.store.revision('bob')).notices; assert.equal(notices.length, 1); assert.equal(notices[0].eventType, 'nudge');
  assert.equal((await f.store.revision()).revision, revision, 'reading notices does not trigger remote board refreshes');
  f.store = new CollaborationStore(f.dir, f.gateway);
  assert.equal((await f.store.revision('bob')).notices.length, 1);
  assert.equal((await f.store.revision('alice')).notices.filter(item => item.eventType === 'claimed').length, 1);
  await f.store.markNoticesRead('bob', (await f.store.revision('alice')).notices.map(item => item.id));
  assert.equal((await f.store.revision('alice')).notices.length, 1, 'one user cannot consume another user unread records');
});

test('nudges and linked replies are permission checked, append-only and replay safe without changing approval state', async () => {
  const f = await fixture(), task = await personal(f); let w = await claim(f, task);
  w = await act(f, w, 'bob', 'submit', { comment: '提交结果' });
  await assert.rejects(act(f, w, 'bob', 'nudge'), { status: 403 });
  await assert.rejects(act(f, w, 'offline', 'nudge'), { status: 403 });
  const command = { id: randomUUID(), workflowId: w.id, version: w.version, action: 'nudge' };
  w = await f.store.workflowCommand('alice', command); assert.equal(w.status, 'submitted');
  w = await f.store.workflowCommand('alice', command); assert.equal(w.events.filter(item => item.type === 'nudge').length, 1);
  await assert.rejects(act(f, w, 'alice', 'reply-nudge', { replyTo: command.id, comment: '非法代回复' }), { status: 403 });
  await assert.rejects(act(f, w, 'bob', 'reply-nudge', { replyTo: randomUUID(), comment: '错误目标' }), { status: 404 });
  await assert.rejects(act(f, w, 'bob', 'reply-nudge', { replyTo: command.id, comment: 23 }), { status: 400 });
  await assert.rejects(act(f, w, 'bob', 'reply-nudge', { replyTo: command.id, comment: '  ' }), { status: 400 });
  const reply = { id: randomUUID(), workflowId: w.id, version: 0, action: 'reply-nudge', replyTo: command.id, comment: '已经提交，请查看附件' };
  w = await f.store.workflowCommand('bob', reply); w = await f.store.workflowCommand('bob', reply);
  assert.equal(w.status, 'submitted'); assert.equal(w.events.filter(item => item.type === 'reply-nudge').length, 1);
  assert.equal(w.events.at(-1).replyTo, command.id);
  assert.equal((await f.store.revision('alice')).notices.filter(item => item.eventType === 'reply-nudge').length, 1);
  w = await act(f, w, 'alice', 'approve'); assert.equal(w.status, 'done');
  await assert.rejects(act(f, w, 'alice', 'nudge'), /无需催办/);
});

test('every newly created record is queued once for push while migration and retries do not replay history', async () => {
  const f = await fixture(), sent = []; f.gateway.notify = async notice => { sent.push(notice.id); };
  const task = await f.create('推送'); let w = await claim(f, task);
  w = await act(f, w, 'alice', 'nudge');
  await f.store.deliverNotices(); await f.store.deliverNotices();
  assert.equal(sent.length, 3); assert.equal(new Set(sent).size, 3);
  const file = path.join(f.dir, 'room-collaboration.json'), state = JSON.parse(await readFile(file, 'utf8'));
  delete state.notifications; await writeFile(file, JSON.stringify(state));
  f.store = new CollaborationStore(f.dir, f.gateway);
  assert.equal((await f.store.revision('bob')).notices.length, 0, 'migration establishes historical baseline');
  w = await act(f, w, 'bob', 'submit', { comment: '新提交' }); await f.store.deliverNotices();
  assert.equal(sent.length, 4); assert.equal((await f.store.revision('alice')).notices.length, 1);
  f.gateway.notify = async notice => { sent.push(notice.id); throw new Error('lost provider response'); };
  w = await act(f, w, 'alice', 'reject', { comment: '补充材料' });
  await f.store.deliverNotices(); await f.store.deliverNotices(); assert.equal(sent.length, 5);
  assert.equal((await f.store.revision('bob')).notices.length, 1, 'failed push keeps durable in-app unread record');
});
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
  let w = await claim(f, updated); assert.equal(w.reviewerId, 'alice'); assert.equal(w.reviewerTaskId, undefined);
  assert.equal((await f.store.snapshot('bob')).buffer[0].workflowId, w.id);
  assert.equal(f.accounts.alice.size, 0); assert.equal(f.accounts.bob.size, 1);
  w = await act(f, w, 'bob', 'submit'); w = await act(f, w, 'alice', 'approve');
  assert.equal(w.status, 'done'); assert.equal((await f.store.snapshot('bob')).buffer.length, 0);
  assert.equal((await f.store.revision()).bufferCount, 0);
});

test('self-collection creates one ordinary unfinished inbox task without workflow labels and allows a later normal claim', async () => {
  const f = await fixture(), task = await f.create('自己认领'); let completes = 0;
  const complete = f.gateway.complete; f.gateway.complete = async (...args) => { completes++; await complete(...args); };
  const command = { id: randomUUID(), action: 'claim', source: source(task), destination: 'alice' };
  const receipt = await f.store.claim('alice', command); assert.equal(f.counts.creates, 1); assert.equal(completes, 0);
  let snapshot = await f.store.snapshot('alice'); assert.equal(snapshot.buffer.length, 0); assert.equal(snapshot.workflows.length, 0);
  const inboxTask = snapshot.members.find(member => member.id === 'alice').tasks[0]; assert.equal(inboxTask.id, receipt.targetId); assert.ok(!inboxTask.workflowId); assert.ok(!inboxTask.pending); assert.ok(!f.accounts.alice.get(inboxTask.id).status);
  f.store = new CollaborationStore(f.dir, f.gateway); await f.store.claim('alice', command); assert.equal(f.counts.creates, 1);
  let w = await claim(f, inboxTask, 'bob'); assert.equal(w.source.ownerId, 'alice'); assert.equal(w.reviewerId, 'alice'); assert.equal(w.status, 'working');
  snapshot = await f.store.snapshot('bob'); assert.equal(snapshot.workflows.length, 1);
  w = await act(f, w, 'bob', 'submit'); w = await act(f, w, 'alice', 'approve'); assert.equal(w.status, 'done'); assert.equal(completes, 2);
});

test('failed self-collection retains a recoverable public task and resumes creation without exposing an approval workflow', async () => {
  const f = await fixture(), task = await f.create('网络中断'); f.loseCreate();
  const receipt = await claim(f, task, 'alice'); assert.equal(receipt.status, 'creating');
  const pending = await f.store.snapshot('alice'); assert.equal(pending.workflows.length, 0); assert.equal(pending.buffer[0].pending, receipt.id); assert.equal(pending.operations.find(op => op.id === receipt.id).action, 'collect');
  await assert.rejects(f.store.resume('bob', receipt.id), { status: 403 });
  await assert.rejects(f.store.resume('alice', receipt.id, true), /创建请求/);
  f.store = new CollaborationStore(f.dir, f.gateway);
  assert.equal((await f.store.resume('alice', receipt.id)).status, 'done'); assert.equal(f.counts.creates, 1);
  assert.equal((await f.store.snapshot('alice')).buffer.length, 0);
});

test('an ordinary self-collected task completes through the personal endpoint without self-approval', async () => {
  const f = await fixture(), task = await f.create('个人任务'), receipt = await claim(f, task, 'alice');
  let calls = 0;
  await f.store.personalCompletion('alice', receipt.targetId, async () => { calls++; await f.gateway.complete('alice', receipt.targetId); });
  assert.equal(calls, 1); assert.equal((await f.store.snapshot('alice')).workflows.length, 0);
});

test('previous self-approval records become ordinary inbox tasks without marking them complete', async () => {
  const f = await fixture(), task = await f.create('旧个人任务'), receipt = await claim(f, task, 'alice');
  const file = path.join(f.dir, 'room-collaboration.json'), state = JSON.parse(await readFile(file, 'utf8'));
  state.workflows[receipt.id].status = 'working'; state.buffer[task.id] = { fields: taskFields(task), version: 1, publisherId: 'alice' }; await writeFile(file, JSON.stringify(state));
  await f.store.resetLegacy('alice'); const snapshot = await f.store.snapshot('alice'); assert.equal(snapshot.buffer.length, 0); assert.equal(snapshot.workflows.length, 0);
  assert.ok(!snapshot.members.find(member => member.id === 'alice').tasks[0].workflowId); assert.ok(!f.accounts.alice.get(receipt.targetId).status);
  const version = snapshot.revision; await f.store.resetLegacy('alice'); assert.equal((await f.store.snapshot('alice')).revision, version);
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

test('acknowledged claim recovery follows an exact ID moved before readback without duplicating tasks', async () => {
  const f = await fixture(), task = await f.create('创建后移动');
  f.gateway.create = async (owner, id, fields, receipt) => {
    f.counts.creates++;
    f.accounts[owner].set('provider-moved', { ...fields, id: 'provider-moved', projectId: 'another-list' });
    await receipt('provider-moved'); throw new Error('initial readback unavailable');
  };
  const get = f.gateway.get;
  f.gateway.get = async (owner, id, project = 'inbox-' + owner) => {
    const found = await get(owner, id); return found?.projectId === project ? found : null;
  };
  f.gateway.locate = async (owner, id) => get(owner, id);
  let w = await claim(f, task); assert.equal(w.status, 'creating');
  f.store = new CollaborationStore(f.dir, f.gateway);
  await f.store.recoverPendingWorkflows();
  w = (await f.store.snapshot('bob')).workflows.find(item => item.id === w.id);
  assert.equal(w.status, 'working'); assert.equal(w.error, ''); assert.equal(w.targetId, 'provider-moved');
  const saved = JSON.parse(await readFile(path.join(f.dir, 'room-collaboration.json'), 'utf8'));
  assert.equal(saved.workflows[w.id].projects.target, 'another-list');
  assert.equal(f.counts.creates, 1); assert.equal(f.accounts.alice.size, 0);
});

test('claim checked before verification uses existing approval recovery and preserves failed reopen receipts', async () => {
  for (const failReopen of [false, true]) {
    const f = await fixture(), task = await f.create('创建后提前勾选');
    f.gateway.create = async (owner, id, fields, receipt) => {
      f.counts.creates++; f.accounts[owner].set('completed-id', { ...fields, id: 'completed-id', projectId: 'inbox-' + owner, status: 2 });
      await receipt('completed-id'); throw new Error('initial readback unavailable');
    };
    const reopen = f.gateway.reopen;
    if (failReopen) f.gateway.reopen = async () => { throw new Error('reopen unavailable'); };
    let w = await claim(f, task); assert.equal(w.status, 'creating');
    f.store = new CollaborationStore(f.dir, f.gateway);
    w = await act(f, w, 'bob', 'retry-workflow');
    assert.equal(w.status, 'working'); assert.ok(w.needsSubmission);
    assert.equal(!!w.reopenPending, failReopen);
    if (failReopen) {
      assert.equal(w.syncError, 'reopen unavailable'); assert.equal(f.accounts.bob.get(w.targetId).status, 2);
      f.gateway.reopen = reopen; w = await act(f, w, 'bob', 'retry-workflow');
    }
    assert.equal(f.accounts.bob.get(w.targetId).status, 0);
    assert.equal(w.events.filter(item => item.type === 'external-claimant-check').length, 1);
    assert.equal(f.counts.creates, 1); assert.equal(f.accounts.alice.size, 0);
  }
});

test('claim verification keeps precise mismatch and missing errors without recreating an acknowledged task', async () => {
  for (const result of ['missing', 'changed']) {
    const f = await fixture(), task = await f.create('保留原任务');
    f.gateway.create = async (owner, id, fields, receipt) => {
      f.counts.creates++; await receipt('known-id');
      if (result === 'changed') f.accounts[owner].set('known-id', { ...fields, id: 'known-id', projectId: 'inbox-' + owner, dueDate: '2026-09-11T16:00:00.000Z' });
      throw new Error('initial readback failed');
    };
    let w = await claim(f, task); w = await act(f, w, 'bob', 'retry-workflow');
    assert.equal(w.status, 'creating'); assert.match(w.error, result === 'missing' ? /尚未读到接收方副本/ : /截止时间/);
    assert.equal(f.counts.creates, 1); assert.equal(w.targetId, 'known-id');
    assert.ok((await f.store.snapshot('alice')).buffer.some(item => item.id === task.id));
  }
});

test('workflow diagnostics expose exact target evidence to participants without writes or recovery', async () => {
  const f = await fixture(), task = await f.create('只读诊断'), w = await claim(f, task);
  f.accounts.bob.get(w.targetId).status = 2;
  const filename = path.join(f.dir, 'room-collaboration.json'), before = await readFile(filename, 'utf8');
  const found = await f.store.inspectWorkflow('alice', w.id);
  assert.equal(found.lookup, 'found'); assert.equal(found.target.id, w.targetId); assert.equal(found.target.status, 2);
  assert.deepEqual(found.differences, []); assert.equal(f.accounts.bob.get(w.targetId).status, 2);
  assert.equal(await readFile(filename, 'utf8'), before);
  await assert.rejects(f.store.inspectWorkflow('offline', w.id), { status: 403 });
  await assert.rejects(f.store.inspectWorkflow('unknown', w.id), { status: 403 });
  await assert.rejects(f.store.inspectWorkflow('bob', 'bad-id'), { status: 400 });
  await assert.rejects(f.store.inspectWorkflow('alice', randomUUID()), { status: 404 });
  f.accounts.bob.delete(w.targetId);
  assert.equal((await f.store.inspectWorkflow('bob', w.id)).lookup, 'not-found');
  f.gateway.locate = async () => { throw new CollaborationError('读取受限', 422, '{"endpoint":"/task/filter","status":403}'); };
  const failed = await f.store.inspectWorkflow('alice', w.id);
  assert.equal(failed.lookup, 'unavailable'); assert.equal(failed.lookupError, '读取受限');
  assert.deepEqual(JSON.parse(failed.diagnostic), { endpoint: '/task/filter', status: 403 });
  assert.equal(await readFile(filename, 'utf8'), before); assert.equal(f.counts.creates, 1);
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
    if (publicTask) assert.equal(f.accounts.alice.size, 0); else assert.equal(f.accounts.alice.get(task.id).status, 2); assert.equal(f.accounts.bob.get(w.targetId).status, 2);
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

test('all room members can edit pending review without requiring a new submission', async () => {
  const f = await fixture(), task = await f.create('public'); let w = await claim(f, task);
  w = await act(f, w, 'bob', 'submit', { comment: '保留原提交成果' }); const oldVersion = w.version;
  const submission = structuredClone(w.events.find(event => event.type === 'submit'));
  await assert.rejects(act(f, w, 'stranger', 'update-workflow', { fields: { title: 'no' } }), { status: 403 });
  w = await act(f, w, 'offline', 'update-workflow', { fields: { title: '新标题', content: '新说明', priority: 5, dueDate: '2026-09-15T12:00:00+0800' } });
  assert.equal(w.status, 'submitted'); assert.equal(w.editPending, false);
  assert.deepEqual(w.events.find(event => event.type === 'submit'), submission);
  for (const remote of [f.accounts.bob.get(w.targetId)]) { assert.equal(remote.title, '新标题'); assert.equal(remote.priority, 5); assert.equal(remote.content, '新说明'); }
  assert.equal((await f.store.snapshot('alice')).buffer[0].title, '新标题');
  await assert.rejects(act(f, w, 'alice', 'approve', { version: oldVersion }), /已更新/);
  w = await act(f, w, 'alice', 'approve'); assert.equal(w.status, 'done');
  assert.equal(w.events.filter(event => event.type === 'submit').length, 1);
  w = await act(f, w, 'bob', 'update-workflow', { fields: { content: '完成后补充' } }); assert.equal(w.status, 'done'); assert.equal(f.accounts.alice.size, 0); assert.equal(f.accounts.bob.get(w.targetId).content, '完成后补充'); assert.equal(f.accounts.bob.get(w.targetId).status, 2);
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

test('explicit rejection requires a new submission and external claimant completion still reopens', async () => {
  const f = await fixture(), task = await personal(f); let w = await claim(f, task); w = await act(f, w, 'bob', 'submit');
  f.accounts.bob.get(w.targetId).title = 'changed externally';
  assert.ok(!f.accounts.alice.get(task.id).status);
  w = await act(f, w, 'alice', 'reject'); f.accounts.bob.get(w.targetId).status = 2;
  await assert.rejects(act(f, w, 'bob', 'submit'), /补充完成说明/); assert.equal(f.accounts.bob.get(w.targetId).status, 0);
  await assert.rejects(act(f, { ...w, version: w.version - 1 }, 'bob', 'submit'), /已更新/);
});

test('approval accepts changed linked task contents or etags and preserves the submitted results', async () => {
  for (const origin of ['personal', 'public']) for (const side of origin === 'personal' ? ['alice', 'bob'] : ['bob']) for (const change of ['content', 'etag']) {
    const f = await fixture(), task = origin === 'personal' ? await personal(f) : await f.create('公共审批');
    let w = await claim(f, task);
    w = await act(f, w, 'bob', 'submit', { comment: '按原流程提交的成果' });
    const submitted = structuredClone(w.events.find(event => event.type === 'submit'));
    const current = f.accounts[side].get(side === 'alice' ? task.id : w.targetId);
    current[change] = change === 'content' ? '后来补充的说明与附件链接' : 'provider-version-changed';
    await assert.rejects(act(f, w, 'bob', 'approve'), { status: 403 });
    w = await act(f, w, 'alice', 'approve');
    assert.equal(w.status, 'done');
    assert.equal(current[change], change === 'content' ? '后来补充的说明与附件链接' : 'provider-version-changed');
    assert.equal(f.accounts.bob.get(w.targetId).status, 2);
    if (origin === 'personal') assert.equal(f.accounts.alice.get(task.id).status, 2);
    assert.deepEqual(w.events.find(event => event.type === 'submit'), submitted);
    assert.equal(w.events.filter(event => event.type === 'submit').length, 1);
  }
});

test('changes during completion do not invalidate approval or lose current completion receipts', async () => {
  const f = await fixture(), task = await personal(f); let w = await claim(f, task);
  w = await act(f, w, 'bob', 'submit');
  const complete = f.gateway.complete;
  f.gateway.complete = async (owner, id) => {
    await complete(owner, id);
    if (owner === 'alice') Object.assign(f.accounts.bob.get(w.targetId), { content: '完成期间更新', etag: 'new-etag' });
  };
  w = await act(f, w, 'alice', 'approve');
  assert.equal(w.status, 'done');
  const target = f.accounts.bob.get(w.targetId);
  assert.equal(target.content, '完成期间更新');
  const saved = JSON.parse(await readFile(path.join(f.dir, 'room-collaboration.json'), 'utf8'));
  assert.equal(saved.workflows[w.id].submitted.target, remoteVersion({ ...target, status: 0 }));
});

test('newly recurring remote tasks still stop retries after an uncertain completion', async () => {
  const f = await fixture(), task = await personal(f); let w = await claim(f, task), calls = 0;
  w = await act(f, w, 'bob', 'submit');
  f.accounts.alice.get(task.id).repeatFlag = 'RRULE:FREQ=DAILY';
  f.gateway.complete = async () => { calls++; throw new Error('lost completion response'); };
  w = await act(f, w, 'alice', 'approve');
  w = await act(f, w, 'alice', 'retry-workflow');
  assert.equal(w.status, 'approving'); assert.match(w.error, /重复任务/); assert.equal(calls, 1);
});

test('a recurring target advancing during approval is not completed as the previous occurrence', async () => {
  const f = await fixture(), task = await personal(f, { repeatFlag: 'RRULE:FREQ=DAILY', dueDate: '2026-09-10T12:00:00Z' });
  let w = await claim(f, task); w = await act(f, w, 'bob', 'submit');
  const complete = f.gateway.complete, calls = [];
  f.gateway.complete = async (owner, id) => {
    calls.push(owner); await complete(owner, id);
    if (owner === 'alice') f.accounts.bob.get(w.targetId).dueDate = '2026-09-11T12:00:00.000Z';
  };
  w = await act(f, w, 'alice', 'approve');
  assert.equal(w.status, 'approving'); assert.match(w.error, /重复任务日期已变化/);
  assert.ok(!f.accounts.bob.get(w.targetId).status); assert.deepEqual(calls, ['alice']);
});

test('approval resumes partial success after restart without completing acknowledged side twice', async () => {
  const f = await fixture(), task = await personal(f); let w = await claim(f, task); w = await act(f, w, 'bob', 'submit');
  const completes = [], complete = f.gateway.complete; let fail = true;
  f.gateway.complete = async (owner, id) => { completes.push(owner); if (owner === 'bob' && fail) throw new Error('offline'); await complete(owner, id); };
  w = await act(f, w, 'alice', 'approve'); assert.equal(w.status, 'approving'); assert.equal(f.accounts.alice.get(task.id).status, 2);
  Object.assign(f.accounts.bob.get(w.targetId), { content: '重试前修改的任务', etag: 'retry-version' });
  fail = false; f.store = new CollaborationStore(f.dir, f.gateway); w = await act(f, w, 'alice', 'retry-workflow');
  assert.equal(w.status, 'done'); assert.deepEqual(completes, ['alice', 'bob', 'bob']);
  assert.equal(f.accounts.bob.get(w.targetId).content, '重试前修改的任务');
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

test('external original owner completion finishes both tasks once and updates the same snapshot and notifications', async () => {
  for (const publicTask of [false, true]) {
    const f = await fixture(), task = publicTask ? await f.create('公共外部完成') : await personal(f);
    let w = await claim(f, task);
    if (publicTask) {
      const file = path.join(f.dir, 'room-collaboration.json'), state = JSON.parse(await readFile(file, 'utf8'));
      state.workflows[w.id].reviewerTaskId = 'legacy-publisher-task';
      f.accounts.alice.set('legacy-publisher-task', { id: 'legacy-publisher-task', projectId: 'inbox-alice', ...w.fields });
      await writeFile(file, JSON.stringify(state)); w = await refreshed(f, w.id);
    }
    const sourceId = publicTask ? w.reviewerTaskId : task.id;
    f.accounts.alice.get(sourceId).status = 2;
    let writes = 0; const complete = f.gateway.complete;
    f.gateway.complete = async (...args) => { writes++; await complete(...args); };
    const snapshot = await f.store.snapshot('bob'); w = snapshot.workflows.find(item => item.id === w.id);
    assert.equal(w.status, 'done'); assert.equal(writes, 1); assert.equal(f.accounts.bob.get(w.targetId).status, 2);
    assert.ok(!snapshot.members.find(item => item.id === 'bob').tasks.some(item => item.id === w.targetId));
    if (publicTask) assert.ok(!snapshot.buffer.some(item => item.id === task.id));
    assert.ok(snapshot.notices.some(item => item.eventType === 'external-owner-complete'));
    w = await refreshed(f, w.id); assert.equal(writes, 1); assert.equal(w.events.filter(item => item.type === 'external-owner-complete').length, 1);
  }
});

test('external claimant checkbox restoration retains pending review and original submitted materials', async () => {
  const f = await fixture(), task = await personal(f); let w = await claim(f, task);
  w = await act(f, w, 'bob', 'submit', { comment: '成果说明已提交' });
  const event = w.events.find(item => item.type === 'submit');
  f.accounts.bob.get(w.targetId).status = 2; f.accounts.bob.get(w.targetId).etag = 'external-checkbox';
  const reopen = f.gateway.reopen;
  f.gateway.reopen = async (...args) => { const saved = await reopen(...args); f.accounts.bob.get(saved.id).etag = 'restored-checkbox'; return { ...saved, etag: 'restored-checkbox' }; };
  w = await refreshed(f, w.id); assert.equal(w.status, 'submitted'); assert.ok(!w.needsSubmission);
  assert.deepEqual(w.events.find(item => item.type === 'submit'), event);
  w = await act(f, w, 'alice', 'approve'); assert.equal(w.status, 'done');
});

test('external claimant checkbox restoration permits approval of changed task contents', async () => {
  for (const side of ['alice', 'bob']) {
    const f = await fixture(), task = await personal(f); let w = await claim(f, task);
    w = await act(f, w, 'bob', 'submit', { comment: '原成果' });
    f.accounts[side].get(side === 'alice' ? task.id : w.targetId).content = '审批后修改了要求';
    f.accounts.bob.get(w.targetId).status = 2;
    w = await refreshed(f, w.id); assert.equal(w.status, 'submitted');
    w = await act(f, w, 'alice', 'approve');
    assert.equal(w.status, 'done');
    assert.equal(f.accounts.alice.get(task.id).status, 2);
    assert.equal(f.accounts.bob.get(w.targetId).status, 2);
    assert.equal(f.accounts[side].get(side === 'alice' ? task.id : w.targetId).content, '审批后修改了要求');
  }
});

test('lost reopen response survives restart and cooldown without duplicate incident records', async () => {
  const f = await fixture(), task = await personal(f); let w = await claim(f, task);
  f.accounts.bob.get(w.targetId).status = 2;
  const reopen = f.gateway.reopen; let calls = 0;
  f.gateway.reopen = async (...args) => { calls++; const saved = await reopen(...args); if (calls === 1) throw new Error('lost reopen response'); return saved; };
  w = await refreshed(f, w.id); assert.ok(w.reopenPending); assert.match(w.syncError, /lost reopen/);
  f.store = new CollaborationStore(f.dir, f.gateway);
  w = await refreshed(f, w.id); assert.equal(calls, 1);
  await assert.rejects(act(f, w, 'offline', 'retry-workflow'), /参与者/);
  w = await act(f, w, 'bob', 'retry-workflow'); assert.ok(!w.reopenPending); assert.equal(w.status, 'working');
  assert.equal(w.events.filter(item => item.type === 'external-claimant-check').length, 1);
  assert.equal(w.events.filter(item => item.type === 'external-task-reopened').length, 1);
  assert.equal(f.counts.creates, 1);
  await assert.rejects(act(f, w, 'bob', 'submit'), /补充完成说明/);
  w = await act(f, w, 'bob', 'submit', { comment: '补充成果' }); assert.equal(w.status, 'submitted'); assert.ok(!w.needsSubmission);
});

test('external source completion partial response resumes through durable approval without repeated completion', async () => {
  const f = await fixture(), task = await personal(f); let w = await claim(f, task);
  f.accounts.alice.get(task.id).status = 2;
  let calls = 0; const complete = f.gateway.complete;
  f.gateway.complete = async (...args) => { calls++; await complete(...args); throw new Error('lost complete response'); };
  w = await refreshed(f, w.id); assert.equal(w.status, 'approving'); assert.ok(w.error);
  f.store = new CollaborationStore(f.dir, f.gateway);
  w = await act(f, w, 'alice', 'retry-workflow'); assert.equal(w.status, 'done'); assert.equal(calls, 1);
});

test('advanced recurring occurrence is never rewound or completed by the external checkbox synchronizer', async () => {
  const f = await fixture(), task = await personal(f, { repeatFlag: 'RRULE:FREQ=DAILY', dueDate: '2026-09-09T12:00:00Z' });
  let w = await claim(f, task);
  f.accounts.bob.get(w.targetId).dueDate = '2026-09-10T12:00:00Z';
  f.gateway.reopen = async () => { assert.fail('must not rewind next occurrence'); };
  f.gateway.complete = async () => { assert.fail('must not complete next occurrence'); };
  w = await refreshed(f, w.id); assert.equal(w.status, 'working'); assert.match(w.syncError, /重复任务日期已变化/);
  assert.ok(!w.taskAnomaly); assert.equal(f.counts.creates, 1);
});

test('submit and review discover external owner completion without waiting for a board refresh', async () => {
  for (const action of ['submit', 'approve', 'reject']) {
    const f = await fixture(), task = await personal(f); let w = await claim(f, task);
    if (action !== 'submit') w = await act(f, w, 'bob', 'submit');
    f.accounts.alice.get(task.id).status = 2;
    await assert.rejects(act(f, w, 'offline', action), { status: 403 });
    assert.ok(!f.accounts.bob.get(w.targetId).status);
    w = await act(f, w, action === 'submit' ? 'bob' : 'alice', action, { comment: '成果' });
    assert.equal(w.status, 'done'); assert.equal(f.accounts.bob.get(w.targetId).status, 2);
  }
});
