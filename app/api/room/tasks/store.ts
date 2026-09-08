import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import type { CollaborationCommand, CollaborationSnapshot, OperationView, RoomTask, TaskFields, TaskSource } from "../../../collaboration-types";

export type RemoteTask = Partial<TaskFields> & { id: string; projectId: string; status?: number; parentId?: string; [key: string]: unknown };
export type Gateway = {
  members(): Promise<{ id: string; name: string; connected: boolean }[]>;
  inbox(owner: string): Promise<{ projectId: string; tasks: RemoteTask[] }>;
  get(owner: string, id: string): Promise<RemoteTask | null>;
  create(owner: string, id: string, fields: TaskFields): Promise<void>;
  update(owner: string, id: string, fields: TaskFields, version: string): Promise<void>;
  remove(owner: string, id: string): Promise<void>;
  complete(owner: string, id: string): Promise<void>;
  checkTransfer(owner: string, task: RemoteTask): Promise<void>;
};
type BufferTask = { fields: TaskFields; version: number; stagedBy?: string };
type Operation = OperationView & {
  signature: string; source?: TaskSource; fields: TaskFields; targetId: string;
  phase: "prepared" | "destination-ready" | "source-removed";
};
type State = { version: 1; revision: number; buffer: Record<string, BufferTask>; operations: Record<string, Operation> };
export class CollaborationError extends Error {
  status: number;
  diagnostic?: string;
  constructor(message: string, status = 409, diagnostic?: string) { super(message); this.status = status; this.diagnostic = diagnostic; }
}
const canonicalDate = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
export function taskFields(task: Partial<TaskFields>): TaskFields {
  return {
    title: task.title || "", content: task.content || "", priority: [0, 1, 3, 5].includes(task.priority || 0) ? task.priority || 0 : 0,
    startDate: canonicalDate(task.startDate), dueDate: canonicalDate(task.dueDate), isAllDay: task.isAllDay ?? true, timeZone: task.timeZone || "Asia/Shanghai",
    tags: task.tags || [], reminders: task.reminders || [], repeatFlag: task.repeatFlag || "", repeatFrom: String(task.repeatFrom ?? "2"), desc: task.desc || "", kind: task.kind || "TEXT", items: task.items || [],
  };
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
export const remoteVersion = (task: RemoteTask) => fingerprint({ fields: taskFields(task), status: task.status || 0, parentId: task.parentId || "", desc: task.desc || "", etag: task.etag || "" });
export const sameFields = (a: Partial<TaskFields>, b: Partial<TaskFields>) => fingerprint(taskFields(a)) === fingerprint(taskFields(b));
export function validateFields(input: unknown): Partial<TaskFields> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new CollaborationError("任务内容无效", 400);
  const value = input as Record<string, unknown>, result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (["title", "content", "repeatFlag"].includes(key)) {
      if (typeof item !== "string" || item.length > (key === "title" ? 500 : 10000) || (key === "title" && !item.trim())) throw new CollaborationError("请检查任务标题或内容长度", 400);
      result[key] = key === "title" ? item.trim() : item;
    } else if (key === "priority") {
      if (![0, 1, 3, 5].includes(item as number)) throw new CollaborationError("优先级无效", 400);
      result[key] = item;
    } else if (key === "isAllDay") {
      if (typeof item !== "boolean") throw new CollaborationError("全天设置无效", 400); result[key] = item;
    } else if (key === "startDate" || key === "dueDate") {
      if (item !== null && (typeof item !== "string" || !/[zZ]|[+-]\d\d:?\d\d$/.test(item) || !canonicalDate(item))) throw new CollaborationError("日期必须包含有效的时区", 400);
      result[key] = canonicalDate(item);
    } else if (key === "tags" || key === "reminders") {
      if (!Array.isArray(item) || item.length > 30 || item.some(text => typeof text !== "string" || text.length > 200)) throw new CollaborationError("标签或提醒设置无效", 400); result[key] = item;
    } else if (key === "timeZone") {
      if (typeof item !== "string") throw new CollaborationError("时区无效", 400);
      try { new Intl.DateTimeFormat("en", { timeZone: item }); } catch { throw new CollaborationError("时区无效", 400); } result[key] = item;
    } else throw new CollaborationError("包含不支持编辑的字段", 400);
  }
  return result as Partial<TaskFields>;
}

export class CollaborationStore {
  private queue: Promise<unknown> = Promise.resolve();
  private file: string;
  private gateway: Gateway;
  constructor(directory: string, gateway: Gateway) { this.file = path.join(directory, "room-collaboration.json"); this.gateway = gateway; }
  private async read(): Promise<State> {
    try {
      const state = JSON.parse(await readFile(this.file, "utf8"));
      if (state.version !== 1 || !state.buffer || !state.operations) throw new Error("协作记录格式异常");
      return state;
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, revision: 0, buffer: {}, operations: {} }; throw error; }
  }
  private async write(state: State) {
    await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const temp = `${this.file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, JSON.stringify(state), { mode: 0o600 });
      for (let attempt = 0; ; attempt++) {
        try { await rename(temp, this.file); break; }
        catch (error) { if (process.platform !== "win32" || attempt >= 5 || !["EPERM", "EACCES", "EBUSY"].includes((error as NodeJS.ErrnoException).code || "")) throw error; await new Promise(resolve => setTimeout(resolve, 25 * 2 ** attempt)); }
      }
    } finally { await unlink(temp).catch(() => undefined); }
  }
  private serial<T>(work: () => Promise<T>): Promise<T> { const result = this.queue.then(work); this.queue = result.catch(() => undefined); return result; }
  private async source(state: State, source: TaskSource): Promise<{ fields: TaskFields; version: string; remote?: RemoteTask } | null> {
    if (source.ownerId === null) { const task = Object.hasOwn(state.buffer, source.taskId) ? state.buffer[source.taskId] : null; return task ? { fields: task.fields, version: String(task.version) } : null; }
    const task = await this.gateway.get(source.ownerId, source.taskId);
    return task ? { fields: taskFields(task), version: remoteVersion(task), remote: task } : null;
  }
  private async checkpoint(state: State, op: Operation) { op.updatedAt = Date.now(); state.revision++; await this.write(state); }
  private async finish(state: State, op: Operation) {
    if (op.to === null && state.buffer[op.targetId]?.stagedBy === op.id) delete state.buffer[op.targetId].stagedBy;
    op.status = "done"; op.error = ""; await this.checkpoint(state, op);
  }
  private publicOperation(op: Operation): OperationView { const { id, actorId, title, action, from, to, status, error, updatedAt } = op; return { id, actorId, title, action, from, to, status, error, updatedAt }; }
  async revision() { const state = await this.read(); return { revision: state.revision, bufferCount: Object.values(state.buffer).filter(task => !task.stagedBy).length }; }
  async snapshot(identityId: string): Promise<CollaborationSnapshot> {
    const members = await this.gateway.members();
    const results: CollaborationSnapshot["members"] = [];
    for (let index = 0; index < members.length; index += 3) results.push(...await Promise.all(members.slice(index, index + 3).map(async member => {
      try {
        if (!member.connected) return { ...member, tasks: [], error: "尚未连接滴答清单" };
        const inbox = await this.gateway.inbox(member.id);
        const parents = new Set(inbox.tasks.map(task => task.parentId).filter(Boolean));
        return { ...member, tasks: inbox.tasks.filter(task => !task.status).map(task => ({ ...taskFields(task), id: task.id, ownerId: member.id, version: remoteVersion(task), transferBlocked: task.parentId || parents.has(task.id) ? "含父子任务关系，请先在滴答中整理关系后转移" : undefined })) };
      } catch (error) { return { ...member, tasks: [], error: error instanceof Error ? error.message : "收集箱暂时无法读取", ...(error instanceof CollaborationError && error.diagnostic ? { diagnostic: error.diagnostic } : {}) }; }
    })));
    const state = await this.read();
    const pending = Object.values(state.operations).filter(op => op.status === "pending");
    const lock = (task: RoomTask) => ({ ...task, pending: pending.find(op => (op.source?.ownerId === task.ownerId && op.source.taskId === task.id) || (op.to === task.ownerId && op.targetId === task.id))?.id });
    return {
      identityId, revision: state.revision,
      buffer: Object.entries(state.buffer).map(([id, task]) => lock({ ...task.fields, id, ownerId: null, version: String(task.version) })),
      members: results.map(member => ({ ...member, tasks: member.tasks.map(lock) })),
      operations: Object.values(state.operations).sort((a, b) => b.updatedAt - a.updatedAt).filter((op, index) => op.status === "pending" || index < 30).map(op => this.publicOperation(op)),
    };
  }
  execute(actorId: string, command: CollaborationCommand) {
    return this.serial(async () => {
      if (!command || typeof command.id !== "string" || !/^[a-f0-9-]{36}$/i.test(command.id) || !["create", "update", "move", "complete", "delete"].includes(command.action)) throw new CollaborationError("协作操作无效", 400);
      const members = await this.gateway.members();
      if (!members.some(member => member.id === actorId)) throw new CollaborationError("成员不存在", 403);
      const state = await this.read(), signature = fingerprint({ actorId, command });
      let op = state.operations[command.id];
      if (op) {
        if (op.signature !== signature) throw new CollaborationError("操作编号已被使用");
        if (op.status !== "pending") return this.publicOperation(op);
      } else {
        let fields = taskFields({}); const source = command.source;
        if (command.action === "create") { fields = taskFields(validateFields(command.fields)); if (!fields.title) throw new CollaborationError("请填写任务标题", 400); }
        else {
          if (!source || (source.ownerId !== null && !members.some(member => member.id === source!.ownerId)) || typeof source.taskId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(source.taskId) || typeof source.version !== "string") throw new CollaborationError("任务来源无效", 400);
          if (Object.values(state.operations).some(item => item.status === "pending" && ((item.source?.ownerId === source!.ownerId && item.source.taskId === source!.taskId) || (item.to === source!.ownerId && item.targetId === source!.taskId)))) throw new CollaborationError("任务正在处理中，请先完成或取消之前的操作");
          const current = await this.source(state, source);
          if (!current || current.remote?.status) throw new CollaborationError("任务已完成或已移走，请刷新");
          if (current.version !== source.version) throw new CollaborationError("任务已被修改，请刷新后重新操作");
          fields = current.fields;
          if (command.action === "update") fields = { ...fields, ...validateFields(command.fields) };
          if (command.action === "move") {
            if (command.destination !== null && (typeof command.destination !== "string" || !members.some(member => member.id === command.destination))) throw new CollaborationError("目标成员无效", 400);
            if (command.destination === source.ownerId) throw new CollaborationError("任务已经在此区域", 400);
            if (source.ownerId && current.remote) await this.gateway.checkTransfer(source.ownerId, current.remote);
            if (command.destination) {
              const target = await this.gateway.inbox(command.destination);
              if (target.projectId === "inbox") throw new CollaborationError("该成员收集箱为空且滴答未返回具体编号，请先在其收集箱添加一项后刷新再分配", 422);
              if (current.remote?.projectId === target.projectId) throw new CollaborationError("两位成员连接的是同一个收集箱，无需转移");
            }
          }
        }
        if (fields.startDate && fields.dueDate && Date.parse(fields.startDate) > Date.parse(fields.dueDate)) throw new CollaborationError("截止时间不能早于开始时间", 400);
        op = { id: command.id, signature, actorId, action: command.action, title: fields.title, from: source?.ownerId ?? null, to: command.action === "move" ? command.destination! : null, source, fields, targetId: command.action === "move" && command.destination ? randomBytes(12).toString("hex") : randomUUID(), status: "pending", phase: "prepared", error: "", updatedAt: Date.now() };
        state.operations[op.id] = op; await this.checkpoint(state, op);
      }
      return this.run(state, op);
    });
  }
  resume(actorId: string, id: string, cancel = false) {
    return this.serial(async () => {
      if (!/^[a-f0-9-]{36}$/i.test(id)) throw new CollaborationError("操作编号无效", 400);
      if (!(await this.gateway.members()).some(member => member.id === actorId)) throw new CollaborationError("成员不存在", 403);
      const state = await this.read(), op = state.operations[id];
      if (!op) throw new CollaborationError("操作不存在", 404);
      if (op.status !== "pending") return this.publicOperation(op);
      if (!cancel) return this.run(state, op);
      const current = op.source ? await this.source(state, op.source) : null;
      if (op.action === "move") {
        if (!current) throw new CollaborationError("原任务已移除，请继续完成转移");
        if (op.to) {
          const copy = await this.gateway.get(op.to, op.targetId);
          if (copy) {
            if (copy.status || !sameFields(copy, op.fields)) throw new CollaborationError("接收方任务已变更，暂不能自动撤回，请先核对两个任务");
            await this.gateway.checkTransfer(op.to, copy);
            await this.gateway.remove(op.to, op.targetId);
          }
        } else if (state.buffer[op.targetId]?.stagedBy === op.id) delete state.buffer[op.targetId];
      } else if (op.action === "update" && current && sameFields(current.fields, op.fields)) { await this.finish(state, op); return this.publicOperation(op); }
      else if ((op.action === "delete" && !current) || (op.action === "complete" && current?.remote?.status === 2)) { await this.finish(state, op); return this.publicOperation(op); }
      op.status = "cancelled"; op.error = ""; await this.checkpoint(state, op); return this.publicOperation(op);
    });
  }
  private async run(state: State, op: Operation) {
    try {
      if (op.action === "create") state.buffer[op.targetId] = { fields: op.fields, version: 1 };
      else if (op.action === "move") {
        if (op.phase === "prepared") {
          const source = await this.source(state, op.source!);
          if (!source || source.version !== op.source!.version) throw new CollaborationError("原任务已变更，请取消本次转移后重新操作");
          if (op.to) await this.gateway.create(op.to, op.targetId, op.fields);
          else state.buffer[op.targetId] = { fields: op.fields, version: 1, stagedBy: op.id };
          op.phase = "destination-ready"; await this.checkpoint(state, op);
        }
        if (op.phase === "destination-ready") {
          if (op.to) {
            const target = await this.gateway.get(op.to, op.targetId);
            if (!target || target.status || !sameFields(target, op.fields)) throw new CollaborationError("接收方副本不存在或已变更，原任务暂时保留");
          }
          const source = await this.source(state, op.source!);
          if (source) {
            if (source.version !== op.source!.version) throw new CollaborationError("原任务在转移期间被修改，请取消本次转移后重新操作");
            if (op.source!.ownerId) { await this.gateway.checkTransfer(op.source!.ownerId, source.remote!); await this.gateway.remove(op.source!.ownerId, op.source!.taskId); }
            else delete state.buffer[op.source!.taskId];
          }
          op.phase = "source-removed"; await this.checkpoint(state, op);
        }
      } else {
        const source = await this.source(state, op.source!);
        if (op.action === "delete" && !source) { await this.finish(state, op); return this.publicOperation(op); }
        if (!source) throw new CollaborationError("任务已移走，请取消此次操作并刷新");
        if ((op.action === "update" && sameFields(source.fields, op.fields)) || (op.action === "complete" && source.remote?.status === 2)) { await this.finish(state, op); return this.publicOperation(op); }
        if (source.version !== op.source!.version) throw new CollaborationError("任务已被修改，请取消此次操作并刷新");
        if (op.source!.ownerId) {
          if (op.action === "update") await this.gateway.update(op.source!.ownerId, op.source!.taskId, op.fields, source.version);
          else if (op.action === "complete") await this.gateway.complete(op.source!.ownerId, op.source!.taskId);
          else await this.gateway.remove(op.source!.ownerId, op.source!.taskId);
        } else if (op.action === "update") state.buffer[op.source!.taskId] = { fields: op.fields, version: Number(source.version) + 1 };
        else delete state.buffer[op.source!.taskId];
      }
      await this.finish(state, op);
    } catch (error) { op.error = error instanceof Error ? error.message : "操作结果未确认，请继续处理"; await this.checkpoint(state, op); }
    return this.publicOperation(op);
  }
}
