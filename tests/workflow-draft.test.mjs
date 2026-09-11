import test from 'node:test';
import assert from 'node:assert/strict';
import { rebaseWorkflowDraft } from '../app/workflow-draft.ts';
import { taskFields, sameFields } from '../app/api/room/tasks/store.ts';

test('nudges and unrelated edits preserve the draft without overwriting other fields', () => {
  const base = taskFields({title:'原任务',content:'原说明'}), draft={...base,title:'新任务'};
  assert.deepEqual(rebaseWorkflowDraft(base,draft,base),{patch:{title:'新任务'},conflicts:[]});
  assert.deepEqual(rebaseWorkflowDraft(base,draft,{...base,content:'对方的新说明'}),{patch:{title:'新任务'},conflicts:[]});
  assert.deepEqual(rebaseWorkflowDraft(base,draft,{...base,title:'对方的新标题'}).conflicts,['title']);
  assert.deepEqual(rebaseWorkflowDraft(base,draft,draft).conflicts,[]);
});
test('provider field comparison ignores set ordering and inactive repeat origin, but protects meaningful settings', () => {
  const original=taskFields({title:'检查',tags:['b','a'],reminders:['one','two']});
  assert.ok(sameFields(original,{...original,tags:['a','b'],reminders:['two','one'],repeatFrom:'0'}));
  for(const patch of [{content:'新增'}, {dueDate:'2026-09-12T00:00:00Z'}, {tags:['a']}, {priority:5}]) assert.ok(!sameFields(original,{...original,...patch}));
  assert.ok(!sameFields({...original,repeatFlag:'RRULE:FREQ=DAILY'}, {...original,repeatFlag:'RRULE:FREQ=DAILY',repeatFrom:'0'}));
});
