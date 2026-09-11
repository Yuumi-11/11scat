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

test('relative dates prioritize four days before Monday-based this/next-week labels', async () => {
  const { collaborationDateLabel: label } = await import('../app/collaboration-view.ts');
  const now = new Date('2026-09-11T12:00:00+0800');
  const task = day => ({ dueDate: `${day}T00:00:00+0800`, startDate: null, isAllDay: true });
  for (const [date, expected] of [['2026-09-11','今天'],['2026-09-12','明天'],['2026-09-13','后天'],['2026-09-14','大后天'],['2026-09-10','这周四'],['2026-09-15','下周二'],['2026-09-20','下周日'],['2026-09-21','2026/9/21'],['2026-09-06','2026/9/6']]) assert.equal(label(task(date), now),expected);
});

test('relative dates use Shanghai midnight, preserve time, and handle year boundaries and start-only tasks', async () => {
  const { collaborationDateLabel: label } = await import('../app/collaboration-view.ts');
  assert.equal(label({ dueDate: null, startDate: '2026-09-11T16:05:00Z', isAllDay: false },new Date('2026-09-11T15:59:59Z')),'明天 00:05');
  assert.equal(label({ dueDate: '2026-09-11T16:05:00Z', startDate: null, isAllDay: false },new Date('2026-09-11T16:00:00Z')),'今天 00:05');
  assert.equal(label({ dueDate: '2027-01-04T00:00:00+0800', startDate: null, isAllDay: true },new Date('2026-12-31T12:00:00+0800')),'下周一');
  assert.equal(label({ dueDate: 'bad', startDate: null, isAllDay: true }),'');
});
