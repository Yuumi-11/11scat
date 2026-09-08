import assert from 'node:assert/strict';
import test from 'node:test';
import { collaborationDate, splitCollaborationTasks } from '../app/collaboration-view.ts';

test('member lanes retain every task, sort by deadline or start, and preserve undated order without mutating the snapshot', () => {
  const tasks = [
    { id: 'later-deadline', dueDate: '2026-09-12T18:00:00+0800', startDate: '2026-09-01T09:00:00+0800' },
    { id: 'no-date-1', dueDate: null, startDate: null },
    { id: 'start-only', dueDate: null, startDate: '2026-09-09T10:00:00+0800' },
    { id: 'overdue', dueDate: '2025-12-28T00:00:00+0800', startDate: null },
    { id: 'invalid-date', dueDate: 'invalid', startDate: null },
    { id: 'no-date-2', dueDate: null, startDate: null },
  ];
  const original = structuredClone(tasks);
  const { dated, undated } = splitCollaborationTasks(tasks);
  assert.deepEqual(dated.map(task => task.id), ['overdue', 'start-only', 'later-deadline']);
  assert.deepEqual(undated.map(task => task.id), ['no-date-1', 'invalid-date', 'no-date-2']);
  assert.equal(new Set([...dated, ...undated]).size, tasks.length);
  assert.deepEqual(tasks, original);
  assert.equal(collaborationDate(tasks[0]), tasks[0].dueDate);
  assert.equal(collaborationDate(tasks[2]), tasks[2].startDate);
});

test('chronological sorting compares instants across timezones and keeps equal-time tasks in their existing order', () => {
  const tasks = [
    { id: 'later', dueDate: '2026-09-08T12:00:00+0800', startDate: null },
    { id: 'tie-1', dueDate: '2026-09-08T03:00:00Z', startDate: null },
    { id: 'tie-2', dueDate: '2026-09-08T11:00:00+0800', startDate: null },
    { id: 'fallback', dueDate: 'invalid', startDate: '2026-09-07T23:00:00-0300' },
  ];
  assert.deepEqual(splitCollaborationTasks(tasks).dated.map(task => task.id), ['fallback', 'tie-1', 'tie-2', 'later']);
  assert.deepEqual(splitCollaborationTasks([]), { dated: [], undated: [] });
});
