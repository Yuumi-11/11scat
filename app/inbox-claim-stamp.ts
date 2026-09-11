import type { ClaimWorkflow, RoomTask } from './collaboration-types';

export function inboxClaimant(task: Pick<RoomTask, 'ownerId' | 'workflowId'>, workflow: ClaimWorkflow | undefined, identityId: string): string | null {
  if (!workflow || task.workflowId !== workflow.id || task.ownerId !== identityId || workflow.reviewerId !== identityId || workflow.claimantId === identityId || workflow.status === 'deleted') return null;
  return workflow.claimantId;
}

/** Fit the existing rotated artwork with one scale factor; crop only a little vertically. */
export function inboxStampScale(width: number, height: number, availableWidth: number, cardHeight: number): number {
  if (Math.min(width, height, availableWidth, cardHeight) <= 0) return 0;
  const angle = Math.PI / 30;
  const rotatedWidth = width * Math.cos(angle) + height * Math.sin(angle);
  const rotatedHeight = height * Math.cos(angle) + width * Math.sin(angle);
  return Math.min(0.85, availableWidth / rotatedWidth, (cardHeight + 6) / rotatedHeight);
}
