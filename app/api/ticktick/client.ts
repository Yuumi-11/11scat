export type TickProject = { id: string; name: string; closed?: boolean };
export type TickTask = { id: string; projectId: string; title: string; status?: number; dueDate?: string; startDate?: string };
export type TickV2Snapshot = { inboxId?: string; syncTaskBean?: { add?: TickTask[]; update?: TickTask[] } };

export async function tickFetch(path: string, token: string, init?: RequestInit) {
  return fetch(`https://api.dida365.com/open/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers || {}) },
    signal: init?.signal || AbortSignal.timeout(15_000), cache: "no-store",
  });
}

// The existing account snapshot supplies the account-specific inbox ID.
// Never fall back to a shared environment ID when writing to another account.
export async function tickV2Snapshot(token: string): Promise<TickV2Snapshot | null> {
  try {
    const response = await fetch("https://api.dida365.com/api/v2/batch/check/0", {
      headers: {
        Authorization: `Bearer ${token}`, Cookie: `t=${token}`, "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36",
        "x-device": JSON.stringify({ platform: "web", os: "Windows", device: "Chrome 128", name: "11scat study room", version: 4531, id: "11scat-study-room", channel: "website", campaign: "", websocket: "" }),
      },
      signal: AbortSignal.timeout(15_000), cache: "no-store",
    });
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    return data && typeof data === "object" ? data as TickV2Snapshot : null;
  } catch { return null; }
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
