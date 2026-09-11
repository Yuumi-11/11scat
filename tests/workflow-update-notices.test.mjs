import test from 'node:test';
import assert from 'node:assert/strict';
import { collectTaskNotices, initializeTaskNotices, unreadTaskNotices } from '../app/collaboration-notifications.ts';

test('workflow edits and replies increase unread counts without requiring pending approval', () => {
  const workflow = { id: 'work', title: '任务', status: 'working', source: { ownerId: 'alice' }, reviewerId: 'alice', claimantId: 'bob', events: [] };
  const source = { buffer: {}, workflows: { work: workflow } };
  initializeTaskNotices(source);
  const add = (id, type, actorId) => { workflow.events.push({ id, type, actorId, at: 1, comment: '', files: [] }); collectTaskNotices(source); };
  add('edit', 'updated', 'alice'); add('nudge', 'nudge', 'alice'); add('reply', 'reply-nudge', 'bob');
  assert.equal(workflow.status, 'working');
  assert.deepEqual(unreadTaskNotices(source, 'bob').map(item => item.eventId), ['edit', 'nudge']);
  assert.deepEqual(unreadTaskNotices(source, 'alice').map(item => item.eventId), ['reply']);
  assert.equal(unreadTaskNotices(source, 'other').length, 0);
  collectTaskNotices(source); assert.equal(unreadTaskNotices(source, 'bob').length, 2, 'polling does not duplicate counts');
  source.notifications.read.bob = ['workflow:work:edit'];
  const restored = JSON.parse(JSON.stringify(source));
  assert.deepEqual(unreadTaskNotices(restored, 'bob').map(item => item.eventId), ['nudge']);
  workflow.status = 'deleted'; add('delete', 'task-deleted', 'alice');
  assert.equal(unreadTaskNotices(source, 'bob').length, 2, 'archived updates remain unread until viewed');
});
