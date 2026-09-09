import type { ClaimWorkflow } from "./collaboration-types";

export type TaskNotice = { id: string; kind: "public" | "workflow"; title: string; body: string; at: number; actorId: string; recipients?: string[]; taskId?: string; workflowId?: string; eventId?: string; eventType?: string };
export type TaskNoticeState = { version?: number; known: string[]; entries: TaskNotice[]; read: Record<string, string[]>; attempted: string[] };
type NoticeSource = { buffer: Record<string, { fields: { title: string }; publisherId?: string; stagedBy?: string; completedAt?: number }>; workflows: Record<string, ClaimWorkflow>; notifications?: TaskNoticeState };
export const workflowEventLabels: Record<string, string> = { "external-owner-complete": "原任务方已在滴答完成", "external-claimant-check": "认领任务提前勾选", "external-task-reopened": "已恢复未完成", claimed: "认领", "claimant-delete-requested": "删除认领任务", "claimant-task-deleted": "已删除认领任务", submit: "提交完成", approve: "审批通过", reject: "打回修改", completed: "完成同步", "owner-complete": "发布者直接完成", updating: "修改详情", updated: "详情已同步", "update-replaced": "详情修改已替代", "task-anomaly": "任务状态异常", "task-relocated": "关联位置已更新", "restore-requested": "恢复任务", "tasks-restored": "任务已恢复", nudge: "催办", "reply-nudge": "回复催办" };
function available(source: NoticeSource): TaskNotice[] {
  const items: TaskNotice[] = Object.entries(source.buffer).filter(([, task]) => !task.stagedBy && !task.completedAt).map(([id, task]) => ({ id: `public:${id}`, taskId: id, kind: "public", title: task.fields.title, body: "任务板有一项新公共任务", at: 0, actorId: task.publisherId || "" }));
  for (const workflow of Object.values(source.workflows)) {
    if (workflow.source.ownerId === null && workflow.reviewerId === workflow.claimantId) continue;
    for (const event of workflow.events.filter(event => event.type !== "completed")) items.push({ id: `workflow:${workflow.id}:${event.id}`, workflowId: workflow.id, eventId: event.id, eventType: event.type, kind: "workflow", title: workflow.title, body: `${workflowEventLabels[event.type] || "流程更新"}${event.comment ? `：${event.comment.slice(0, 160)}` : ""}`, at: event.at, actorId: event.actorId, recipients: [...new Set([workflow.reviewerId, workflow.claimantId])] });
  }
  return items;
}
export function initializeTaskNotices(source: NoticeSource) {
  // Existing history is a migration baseline, never a burst of new alerts.
  source.notifications ||= { known: available(source).map(item => item.id), entries: [], read: {}, attempted: [] };
  return source.notifications;
}
export function collectTaskNotices(source: NoticeSource) {
  const notices = initializeTaskNotices(source), known = new Set(notices.known);
  for (const item of available(source)) if (!known.has(item.id)) {
    known.add(item.id); notices.known.push(item.id); notices.entries.push({ ...item, at: item.at || Date.now() });
    notices.version = (notices.version || 0) + 1;
  }
}
export const receivesTaskNotice = (notice: TaskNotice, actor: string) => notice.actorId !== actor && (!notice.recipients || notice.recipients.includes(actor));
export function unreadTaskNotices(source: NoticeSource, actor: string): TaskNotice[] {
  const notices = initializeTaskNotices(source), seen = new Set(notices.read[actor] || []);
  return notices.entries.filter(item => item.eventType !== "completed" && receivesTaskNotice(item, actor) && !seen.has(item.id) && (item.kind !== "public" || (source.buffer[item.taskId!] && !source.buffer[item.taskId!].completedAt)));
}
