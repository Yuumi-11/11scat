import type { ClaimWorkflow, RoomTask } from './collaboration-types';

export function inboxClaimant(task: Pick<RoomTask, 'ownerId' | 'workflowId'>, workflow: ClaimWorkflow | undefined): string | null {
  if (!workflow || task.workflowId !== workflow.id || task.ownerId === null || workflow.status === 'deleted') return null;
  return workflow.claimantId || null;
}

/** Fit the rotated artwork with one scale factor and align its visible right edge. */
export function inboxStampLayout(width: number, height: number, availableWidth: number, cardHeight: number): { scale: number; centerX: number } {
  if (Math.min(width, height, availableWidth, cardHeight) <= 0) return { scale: 0, centerX: 0 };
  const angle = Math.PI / 30;
  const rotatedWidth = width * Math.cos(angle) + height * Math.sin(angle);
  const rotatedHeight = height * Math.cos(angle) + width * Math.sin(angle);
  const scale = Math.min(0.85, availableWidth / rotatedWidth, (cardHeight + 6) / rotatedHeight);
  return { scale, centerX: availableWidth - rotatedWidth * scale / 2 };
}
