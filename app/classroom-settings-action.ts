import type { ClassroomAction } from './classroom-members.ts';

export function parseClassroomAction(value: unknown): ClassroomAction | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (body.action === 'font' && typeof body.font === 'string' && ['sans', 'rounded', 'resource-rounded'].includes(body.font) && Object.keys(body).every(key => ['action', 'font'].includes(key))) return { action: 'font', font: body.font };
  if (body.action === 'request-seat-exchange' && Object.keys(body).length === 1) return { action: body.action };
  if (['approve-seat-exchange', 'decline-seat-exchange', 'cancel-seat-exchange'].includes(String(body.action)) && typeof body.requestId === 'string' && body.requestId.length > 0 && body.requestId.length <= 64 && Object.keys(body).every(key => ['action', 'requestId'].includes(key))) return body as ClassroomAction;
  return null;
}
