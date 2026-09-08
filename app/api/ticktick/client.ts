export type TickProject = { id: string; name: string; closed?: boolean };
export type TickTask = { id: string; projectId: string; title: string; status?: number; dueDate?: string; startDate?: string };

export async function tickFetch(path: string, token: string, init?: RequestInit) {
  return fetch(`https://api.dida365.com/open/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers || {}) },
    signal: init?.signal || AbortSignal.timeout(15_000), cache: "no-store",
  });
}

export class TickApiError extends Error {
  status: number;
  constructor(message: string, status = 502) { super(message); this.status = status; }
}

// Open API resolves "inbox" for the bearer account, including an empty inbox.
// Use the returned real project ID for subsequent task writes and ownership checks.
export async function tickInboxData<T extends { id: string; projectId: string } = TickTask>(token: string): Promise<{ projectId: string; tasks: T[] }> {
  let response: Response;
  try {
    response = await tickFetch("/project/inbox/data", token);
  } catch { throw new TickApiError("滴答收集箱暂时无法连接，请稍后刷新"); }
  if (!response.ok) throw new TickApiError(response.status === 401 ? "滴答授权已失效，请重新连接" : response.status === 403 ? "滴答授权缺少收集箱读取权限" : response.status === 429 ? "滴答请求较频繁，请稍后刷新" : "滴答收集箱暂时无法读取，请稍后刷新", response.status);
  const data = await response.json().catch(() => null);
  const projectId = data?.project?.id;
  if (typeof projectId !== "string" || projectId === "inbox" || !/^[A-Za-z0-9_-]{1,100}$/.test(projectId) || !Array.isArray(data.tasks)) throw new TickApiError("滴答收集箱返回的数据不完整，请稍后刷新");
  return { projectId, tasks: data.tasks.filter((task: T | null) => task && typeof task.id === "string" && task.projectId === projectId) };
}

export type TaskView = "today" | "week" | "undated";
export function filterTasksByView(tasks: TickTask[], view: TaskView, now = Date.now()) {
  const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" });
  const finalKey = dateKey.format(now + (view === "week" ? 7 * 86400000 : 0));
  return tasks.filter(task => {
    if (task.status) return false;
    const date = task.dueDate || task.startDate;
    if (view === "undated") return !date;
    return !!date && /^\d{4}-\d{2}-\d{2}/.test(date) && date.slice(0, 10) <= finalKey;
  }).sort((a, b) => view === "undated" ? a.title.localeCompare(b.title, "zh-CN") : Date.parse(a.dueDate || a.startDate || "") - Date.parse(b.dueDate || b.startDate || ""));
}
