import type { ClaimWorkflow, CollaborationSnapshot } from './collaboration-types';

export function removeSnapshotTask(snapshot: CollaborationSnapshot, ownerId: string | null, taskId: string): CollaborationSnapshot {
  return ownerId === null
    ? { ...snapshot, buffer: snapshot.buffer.filter(task => task.id !== taskId) }
    : { ...snapshot, members: snapshot.members.map(member => member.id === ownerId ? { ...member, tasks: member.tasks.filter(task => task.id !== taskId) } : member) };
}

export function applyWorkflowUpdate(snapshot: CollaborationSnapshot, workflow: ClaimWorkflow): CollaborationSnapshot {
  let next = { ...snapshot, workflows: [...snapshot.workflows.filter(item => item.id !== workflow.id), workflow] };
  if (workflow.status !== 'deleted') return next;
  next = removeSnapshotTask(next, workflow.source.ownerId, workflow.source.taskId);
  next = removeSnapshotTask(next, workflow.claimantId, workflow.targetId);
  if (workflow.reviewerTaskId) next = removeSnapshotTask(next, workflow.reviewerId, workflow.reviewerTaskId);
  return { ...next, buffer: next.buffer.filter(task => task.workflowId !== workflow.id) };
}

export function withoutDeletedWorkflowTasks(snapshot: CollaborationSnapshot): CollaborationSnapshot {
  return snapshot.workflows.filter(workflow => workflow.status === 'deleted').reduce(applyWorkflowUpdate, snapshot);
}
