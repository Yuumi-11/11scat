import test from 'node:test';
import assert from 'node:assert/strict';
import { taskFields } from '../app/api/room/tasks/store.ts';
import { workflowSettingChanges } from '../app/workflow-setting-changes.ts';

test('setting history shows only changed fields with readable old and new values', () => {
  const before = taskFields({ title: '任务', priority: 0 });
  assert.equal(workflowSettingChanges(before, { ...before, priority: 5 }), '优先级：无 → 高');
  assert.equal(workflowSettingChanges(before, before), '设置未变化');
  const summary = workflowSettingChanges(before, { ...before, repeatFlag: 'RRULE:FREQ=WEEKLY;INTERVAL=1', reminders: ['TRIGGER:-PT15M'], tags: ['学习'] });
  assert.equal(summary, '标签：无 → 学习\n重复：不重复 → 每周\n提醒：不提醒 → 提前15分钟');
  assert.equal(workflowSettingChanges({ ...before, priority: 5 }, before), '优先级：高 → 无');
});
