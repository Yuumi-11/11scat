import test from 'node:test';
import assert from 'node:assert/strict';
import {applyWorkflowUpdate,removeSnapshotTask,withoutDeletedWorkflowTasks} from '../app/collaboration-snapshot.ts';
test('confirmed deletion immediately removes only related cards and preserves archived history',()=>{
  const workflow={id:'w',status:'working',source:{ownerId:null,taskId:'public'},claimantId:'bob',reviewerId:'alice',targetId:'target',reviewerTaskId:'reviewer',events:[{id:'history'}]};
  const snapshot={buffer:[{id:'public',workflowId:'w'},{id:'other'}],members:[{id:'alice',tasks:[{id:'reviewer'},{id:'other'}]},{id:'bob',tasks:[{id:'target'},{id:'other'}]}],workflows:[workflow]};
  assert.equal(applyWorkflowUpdate(snapshot,{...workflow,ownerDeletePending:true}).buffer.length,2,'pending flag alone does not authorize whole-task removal');
  const deleted={...workflow,status:'deleted'};
  const result=applyWorkflowUpdate(snapshot,deleted);
  assert.deepEqual(result.buffer,[{id:'other'}]);
  assert.ok(result.members.every(member=>member.tasks.length===1&&member.tasks[0].id==='other'));
  assert.deepEqual(result.workflows,[deleted]);assert.equal(snapshot.buffer.length,2,'no mutation of an older snapshot');
  assert.deepEqual(withoutDeletedWorkflowTasks({...snapshot,workflows:[deleted]}),result,'a stale public card cannot reappear with archived deletion history');
  assert.deepEqual(removeSnapshotTask(snapshot,null,'public').buffer,[{id:'other'}]);
});

test('accepted whole-task deletion hides public cards while retaining unconfirmed inbox tasks and history', () => {
  const workflow = { id: 'w', status: 'working', source: { ownerId: null, taskId: 'public' }, claimantId: 'bob', targetId: 'target', events: [{ id: 'history', comment: '保留材料', files: [{ id: 'file' }] }] };
  const snapshot = { buffer: [{ id: 'public', workflowId: 'w' }, { id: 'other' }], members: [{ id: 'bob', tasks: [{ id: 'target' }] }], workflows: [workflow] };
  const pending = { ...workflow, ownerDeletePending: true, events: [...workflow.events, { id: 'deletion', type: 'task-delete-requested' }] };
  const result = applyWorkflowUpdate(snapshot, pending);
  assert.deepEqual(result.buffer, [{ id: 'other' }]);
  assert.deepEqual(result.members, snapshot.members);
  assert.deepEqual(result.workflows, [pending]);
  assert.deepEqual(withoutDeletedWorkflowTasks({ ...snapshot, workflows: [pending] }), result);
  assert.equal(snapshot.buffer.length, 2, 'the previous snapshot remains intact');
  for (const type of ['owner-task-deleted', 'claimant-task-deleted']) {
    const legacy = { ...pending, events: [...workflow.events, { id: 'deletion', type }] };
    assert.deepEqual(withoutDeletedWorkflowTasks({ ...snapshot, workflows: [legacy] }).buffer, snapshot.buffer);
  }
});
