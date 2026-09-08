import { getUser, listRoomMembers } from "../../identity/store";
import { decryptToken } from "../../ticktick/crypto";
import { tickFetch, tickInboxData, TickApiError } from "../../ticktick/client";
import { CollaborationError, remoteVersion, sameFields, verificationIssue, type Gateway, type RemoteTask } from "./store";
import type { TaskFields } from "../../../collaboration-types";

type Context = { token: string; projectId: string; tasks: RemoteTask[]; encrypted: string; expires: number; search?: Promise<RemoteTask[]> };
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
  if (account.projectId === "inbox") throw new CollaborationError("收集箱为空且滴答未返回具体编号，暂不能分配任务；请先在滴答收集箱添加一项后刷新", 422);
  const response = await tickFetch(route.replaceAll("{inbox}", encodeURIComponent(account.projectId)), account.token, init);
  if (missing && response.status === 404) return null;
  if (!response.ok) throw new CollaborationError(response.status === 429 ? "滴答请求较频繁，请稍后重试" : response.status === 401 || response.status === 403 ? "滴答授权不足或已失效，请该成员重新连接" : "滴答操作暂未完成，请稍后继续处理", response.status >= 500 ? 502 : 422);
  if (response.status === 204) return {};
  const text = await response.text();
  if (!text && init?.method && init.method !== "GET") return {};
  try { return JSON.parse(text); } catch { throw new CollaborationError("滴答返回的数据不完整，请稍后重试", 502); }
}
const validId = (id: string) => /^[A-Za-z0-9_-]{1,100}$/.test(id);
const payload = (fields: TaskFields) => ({ ...fields, startDate: fields.startDate?.replace(/\.\d{3}Z$/, "+0000") ?? null, dueDate: fields.dueDate?.replace(/\.\d{3}Z$/, "+0000") ?? null });
export const gateway: Gateway = {
  async members() { return Promise.all((await listRoomMembers()).map(async member => ({ ...member, connected: !!(await getUser(member.id))?.ticktickToken }))); },
  async inbox(owner) {
    const account = await context(owner, true);
    return { projectId: account.projectId, tasks: account.tasks };
  },
  async get(owner, id, projectId) {
    if (!validId(id) || (projectId !== undefined && !validId(projectId))) throw new CollaborationError("任务编号无效", 400);
    const account = await context(owner);
    const project = projectId || account.projectId;
    const task = await request(owner, `/project/${encodeURIComponent(project)}/task/${encodeURIComponent(id)}`, undefined, true);
    if (task && (task.id !== id || task.projectId !== project)) throw new CollaborationError("滴答返回的任务编号或清单与请求不符", 403);
    return task as RemoteTask | null;
  },
  async locate(owner, id, projectId) {
    const found = await gateway.get(owner, id, projectId);
    if (found) return found;
    const account = await context(owner);
    // One bounded search per account refresh, shared by missing workflow tasks.
    // The documented filter returns at most 200 entries, so absence here does
    // not prove deletion. Only an exact task ID match repairs a moved link.
    account.search ||= request(owner, "/task/filter", { method: "POST", body: JSON.stringify({ status: [0, 2, -1] }) }).then(data => {
      if (!Array.isArray(data) || data.some(task => !task || typeof task.id !== "string" || !validId(task.id) || typeof task.projectId !== "string" || !validId(task.projectId))) throw new CollaborationError("滴答状态查询返回的数据不完整，请稍后重试", 502);
      return data as RemoteTask[];
    });
    const candidate = (await account.search).find(task => task.id === id);
    return candidate ? gateway.get(owner, id, candidate.projectId) : null;
  },
  async create(owner, id, fields, receipt) {
    const existing = await gateway.get(owner, id);
    if (existing) { if (existing.status || !sameFields(existing, fields)) throw new CollaborationError(verificationIssue(existing, fields)); return; }
    const account = await context(owner);
    const data = await request(owner, "/task/batch", { method: "POST", body: JSON.stringify({ add: [{ ...payload(fields), id, projectId: account.projectId }] }) });
    if (data?.id2error?.[id] && data.id2error[id] !== "EXISTED") throw new CollaborationError("接收方未接受任务，请检查授权或账户配额", 422);
    // A batch add may allocate its own ID. The response, not the proposed ID,
    // identifies the task that was actually created.
    const ids = data?.id2etag && typeof data.id2etag === "object" ? Object.keys(data.id2etag) : [];
    const actualId = ids.length === 1 ? ids[0] : ids.includes(id) ? id : undefined;
    if (!actualId || !/^[A-Za-z0-9_-]{1,100}$/.test(actualId)) throw new CollaborationError("滴答未返回明确的创建编号，已停止重复创建，请核对已有副本");
    await receipt?.(actualId);
    const created = await gateway.get(owner, actualId);
    if (!created || created.status || !sameFields(created, fields)) throw new CollaborationError(verificationIssue(created, fields));
  },
  async update(owner, id, fields, version, projectId) {
    const account = await context(owner), existing = await gateway.get(owner, id, projectId);
    if (!existing) throw new CollaborationError("任务不存在");
    if (remoteVersion(existing) !== version) throw new CollaborationError("任务刚被修改，请刷新后重新编辑");
    // Keep provider-specific task fields while updating only the editor's supported values.
    await request(owner, `/task/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify({ ...existing, ...payload(fields), id, projectId: projectId || account.projectId }) });
    const saved = await gateway.get(owner, id, projectId);
    if (!saved || !sameFields(saved, fields)) throw new CollaborationError("滴答尚未确认全部修改，请继续核对或取消重试");
  },
  async remove(owner, id) { await request(owner, `/project/{inbox}/task/${encodeURIComponent(id)}`, { method: "DELETE" }, true); },
  async complete(owner, id, projectId) {
    if (projectId !== undefined && !validId(projectId)) throw new CollaborationError("清单编号无效", 400);
    await request(owner, `/project/${projectId ? encodeURIComponent(projectId) : "{inbox}"}/task/${encodeURIComponent(id)}/complete`, { method: "POST" });
  },
  async checkTransfer(owner, task) {
    if (task.parentId || ["attachments", "attachmentIds"].some(key => Array.isArray(task[key]) ? (task[key] as unknown[]).length > 0 : !!task[key])) throw new CollaborationError("此任务含父子关系或附件，暂不跨账户转移，原任务已保留");
    if (Array.isArray(task.focusSummaries) && task.focusSummaries.length) throw new CollaborationError("此任务含专注历史，暂不转移以保留原记录");
    const inbox = await gateway.inbox(owner);
    if (inbox.tasks.some(child => child.parentId === task.id)) throw new CollaborationError("此任务含子任务，请先整理关系后再转移");
    const comments = await request(owner, `/project/{inbox}/task/${encodeURIComponent(task.id)}/comments`);
    if (!Array.isArray(comments) || comments.length) throw new CollaborationError("此任务含评论或评论状态无法确认，暂不转移以保留原记录");
  },
};
