import test from 'node:test';
import assert from 'node:assert/strict';
import { clearLegacyRecords } from '../app/legacy-record-cleanup.ts';

test('authorized cleanup removes all old move statuses and notices, preserves workflows, normal operations and public tasks', () => {
  const state = {
    revision: 5, legacyReset: true, legacyCleanup: [{ title: 'old warning' }],
    operations: { a: { action: 'move', status: 'pending' }, b: { action: 'move', status: 'done' }, c: { action: 'move', status: 'cancelled' }, d: { action: 'create', status: 'pending' } },
    buffer: { task: { stagedBy: 'a', fields: { title: 'public task' }, publisherId: 'alice' } },
    workflows: { claim: { status: 'review', claimantId: 'bob' } },
  };
  const workflows = structuredClone(state.workflows);
  assert.deepEqual(clearLegacyRecords(state), { removed: 3, changed: true });
  assert.deepEqual(Object.keys(state.operations), ['d']); assert.ok(!('legacyCleanup' in state));
  assert.deepEqual(state.workflows, workflows); assert.equal(state.buffer.task.fields.title, 'public task'); assert.equal(state.buffer.task.publisherId, 'alice'); assert.ok(!state.buffer.task.stagedBy);
  assert.equal(state.revision, 6); assert.deepEqual(clearLegacyRecords(state), { removed: 0, changed: false }); assert.equal(state.revision, 6);
});
