import test from 'node:test';
import assert from 'node:assert/strict';
import { inboxResponseShape } from '../app/api/ticktick/diagnostics/shape.ts';

test('inbox diagnostics distinguish missing/alias metadata without exposing account IDs, task text or tokens', () => {
  const data = { project: { id: 'inbox', name: 'private-name' }, tasks: [{ id: 'private-task-id', projectId: 'private-account-id', title: 'private-title', content: 'private-content' }], message: 'private-token', unexpected: 'private-extra' };
  const shape = inboxResponseShape(data), serialized = JSON.stringify(shape);
  assert.equal(shape.project.id, 'inbox-alias'); assert.equal(shape.tasks.concreteProjectIds, 1);
  assert.ok(!serialized.includes('private-'));
  assert.equal(inboxResponseShape({ tasks: [] }).project.id, 'undefined');
  assert.equal(inboxResponseShape({ project: null, tasks: [] }).fields.project, 'null');
  assert.equal(inboxResponseShape(null).rootType, 'null');
});
