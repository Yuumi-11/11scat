import { getUser, listRoomMembers } from "../../identity/store";
import { decryptToken } from "../../ticktick/crypto";
import { tickFetch, tickInboxData, TickApiError } from "../../ticktick/client";
import { CollaborationError, remoteVersion, sameFields, type Gateway, type RemoteTask } from "./store";
import type { TaskFields } from "../../../collaboration-types";

type Context = { token: string; projectId: string; tasks: RemoteTask[]; encrypted: string; expires: number };
const contexts = new Map<string, Context>();
async function context(owner: string, refreshInbox = false): Promise<Context> {
  const user = await getUser(owner);
  if (!user?.ticktickToken) throw new CollaborationError("该成员尚未连接滴答清单", 422);
  const cached = contexts.get(owner);
  if (!refreshInbox && cached?.encrypted === user.ticktickToken && cached.expires > Date.now()) return cached;
  let token: string;
  try { token = decryptToken(user.ticktickToken); } catch { throw new CollaborationError("该成员需要重新连接滴答清单", 422); }
  let inbox;
  try { inbox = await tickInboxData<RemoteTask>(token); }
  catch (error) { throw new CollaborationError(error instanceof TickApiError ? error.message : "收集箱暂时无法读取，请稍后刷新", error instanceof TickApiError && [401, 403].includes(error.status) ? 422 : 502, error instanceof TickApiError ? error.diagnostic : undefined); }
  const next = { token, ...inbox, encrypted: user.ticktickToken, expires: Date.now() + 15000 };
  contexts.set(owner, next); return next;
}
async function request(owner: string, route: string, init?: RequestInit, missing = false) {
  const account = await context(owner);
  const response = await tickFetch(route.replaceAll("{inbox}", encodeURIComponent(account.projectId)), account.token, init);
  if (missing && response.status === 404) return null;
  if (!response.ok) throw new CollaborationError(response.status === 429 ? "滴答请求较频繁，请稍后重试" : response.status === 401 || response.status === 403 ? "滴答授权不足或已失效，请该成员重新连接" : "滴答操作暂未完成，请稍后继续处理", response.status >= 500 ? 502 : 422);
  return response.status === 204 ? {} : response.json().catch(() => ({}));
}
const payload = (fields: TaskFields) => ({ ...fields, startDate: fields.startDate?.replace(/\.\d{3}Z$/, "+0000") ?? null, dueDate: fields.dueDate?.replace(/\.\d{3}Z$/, "+0000") ?? null });
export const gateway: Gateway = {
  async members() { return Promise.all((await listRoomMembers()).map(async member => ({ ...member, connected: !!(await getUser(member.id))?.ticktickToken }))); },
  async inbox(owner) {
    const account = await context(owner, true);
    return { projectId: account.projectId, tasks: account.tasks };
  },
  async get(owner, id) {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new CollaborationError("任务编号无效", 400);
    const account = await context(owner);
    const task = await request(owner, `/project/{inbox}/task/${encodeURIComponent(id)}`, undefined, true);
    if (task && (task.id !== id || task.projectId !== account.projectId)) throw new CollaborationError("仅允许操作该成员收集箱中的任务", 403);
    return task as RemoteTask | null;
  },
  async create(owner, id, fields) {
    const existing = await gateway.get(owner, id);
    if (existing) { if (existing.status || !sameFields(existing, fields)) throw new CollaborationError("接收方任务已经发生变更，暂不重复创建"); return; }
    const account = await context(owner);
    const data = await request(owner, "/task/batch", { method: "POST", body: JSON.stringify({ add: [{ ...payload(fields), id, projectId: account.projectId }] }) });
    if (data?.id2error?.[id] && data.id2error[id] !== "EXISTED") throw new CollaborationError("接收方未接受任务，请检查授权或账户配额", 422);
    const created = await gateway.get(owner, id);
    if (!created || created.status || !sameFields(created, fields)) throw new CollaborationError("接收方任务尚未核实，原任务仍保留");
  },
  async update(owner, id, fields, version) {
    const account = await context(owner), existing = await gateway.get(owner, id);
    if (!existing) throw new CollaborationError("任务不存在");
    if (remoteVersion(existing) !== version) throw new CollaborationError("任务刚被修改，请刷新后重新编辑");
    // Keep provider-specific task fields while updating only the editor's supported values.
    await request(owner, `/task/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify({ ...existing, ...payload(fields), id, projectId: account.projectId }) });
    const saved = await gateway.get(owner, id);
    if (!saved || !sameFields(saved, fields)) throw new CollaborationError("滴答尚未确认全部修改，请继续核对或取消重试");
  },
  async remove(owner, id) { await request(owner, `/project/{inbox}/task/${encodeURIComponent(id)}`, { method: "DELETE" }, true); },
  async complete(owner, id) { await request(owner, `/project/{inbox}/task/${encodeURIComponent(id)}/complete`, { method: "POST" }); },
  async checkTransfer(owner, task) {
    if (task.parentId || ["attachments", "attachmentIds"].some(key => Array.isArray(task[key]) ? (task[key] as unknown[]).length > 0 : !!task[key])) throw new CollaborationError("此任务含父子关系或附件，暂不跨账户转移，原任务已保留");
    if (Array.isArray(task.focusSummaries) && task.focusSummaries.length) throw new CollaborationError("此任务含专注历史，暂不转移以保留原记录");
    const inbox = await gateway.inbox(owner);
    if (inbox.tasks.some(child => child.parentId === task.id)) throw new CollaborationError("此任务含子任务，请先整理关系后再转移");
    const comments = await request(owner, `/project/{inbox}/task/${encodeURIComponent(task.id)}/comments`);
    if (!Array.isArray(comments) || comments.length) throw new CollaborationError("此任务含评论或评论状态无法确认，暂不转移以保留原记录");
  },
};
