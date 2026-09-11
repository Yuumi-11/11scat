import type { ClassroomAction } from './classroom-members.ts';

export function parseClassroomAction(value: unknown): ClassroomAction | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (body.action === 'save-settings' && (body.seat === 'tablet' || body.seat === 'laptop') && Object.keys(body).every(key => ['action', 'seat'].includes(key))) return { action: body.action, seat: body.seat };
  return null;
}
