import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { decryptToken } from "../crypto";

type TickProject = { id: string; name: string; closed?: boolean };
type TickTask = {
  id: string;
  projectId: string;
  title: string;
  status?: number;
  dueDate?: string;
  startDate?: string;
};
type TickV2Snapshot = {
  inboxId?: string;
  syncTaskBean?: {
    add?: TickTask[];
    update?: TickTask[];
  };
};

async function accessToken() {
  const payload = (await cookies()).get("tt_access")?.value;
  if (!payload) return null;
  try { return decryptToken(payload); } catch { return null; }
}

async function tickFetch(path: string, token: string, init?: RequestInit) {
  return fetch(`https://api.dida365.com/open/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
}

async function tickV2Snapshot(token: string): Promise<TickV2Snapshot | null> {
  try {
    const response = await fetch("https://api.dida365.com/api/v2/batch/check/0", {
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `t=${token}`,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36",
        "x-device": JSON.stringify({
          platform: "web",
          os: "Windows",
          device: "Chrome 128",
          name: "11scat study room",
          version: 4531,
          id: "11scat-study-room",
          channel: "website",
          campaign: "",
          websocket: "",
        }),
      },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    return data && typeof data === "object" ? data as TickV2Snapshot : null;
  } catch {
    return null;
  }
}

const shanghaiDateKey = (value: Date | number) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(value);

export async function GET(request: Request) {
  const token = await accessToken();
  if (!token) return new NextResponse("Not connected", { status: 401 });
  const projectResponse = await tickFetch("/project", token);
  if (!projectResponse.ok) return new NextResponse("TickTick unavailable", { status: projectResponse.status });

  const projects: TickProject[] = await projectResponse.json();
  const activeProjects = projects.filter((project) => !project.closed);
  const snapshot = await tickV2Snapshot(token);
  const inboxId = typeof snapshot?.inboxId === "string"
    ? snapshot.inboxId
    : (process.env.TICKTICK_INBOX_ID || "");
  const projectsToRead = inboxId && !activeProjects.some((project) => project.id === inboxId)
    ? [...activeProjects, { id: inboxId, name: "收集箱" }]
    : activeProjects;
  const datasetResponses = await Promise.all(projectsToRead.map(async (project) => {
    const response = await tickFetch(`/project/${encodeURIComponent(project.id)}/data`, token);
    if (!response.ok) return { ok: false as const, projectId: project.id, tasks: [] as TickTask[] };
    const data = await response.json().catch(() => null);
    if (!data || !Array.isArray(data.tasks)) return { ok: false as const, projectId: project.id, tasks: [] as TickTask[] };
    return { ok: true as const, projectId: project.id, tasks: data.tasks as TickTask[] };
  }));
  if (datasetResponses.some((dataset) => !dataset.ok && dataset.projectId !== inboxId)) {
    return new NextResponse("TickTick task read failed", { status: 502 });
  }

  const projectNames = new Map(projectsToRead.map((project) => [project.id, project.name]));
  const inboxFallbackTasks = inboxId
    ? [...(snapshot?.syncTaskBean?.add || []), ...(snapshot?.syncTaskBean?.update || [])]
      .filter((task) => task.projectId === inboxId)
    : [];
  const uniqueTasks = new Map<string, TickTask>();
  for (const task of [...datasetResponses.flatMap((dataset) => dataset.tasks), ...inboxFallbackTasks]) {
    if (task && typeof task.id === "string") uniqueTasks.set(task.id, task);
  }
  const view = new URL(request.url).searchParams.get("view") === "today" ? "today" : "week";
  const todayKey = shanghaiDateKey(Date.now());
  const finalDateKey = view === "today" ? todayKey : shanghaiDateKey(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const tasks = [...uniqueTasks.values()]
    .filter((task) => {
      const taskDate = task.dueDate || task.startDate;
      if (task.status || !taskDate) return false;
      const dueDateKey = taskDate.slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(dueDateKey) && dueDateKey <= finalDateKey;
    })
    .sort((a, b) => Date.parse(a.dueDate || a.startDate || "") - Date.parse(b.dueDate || b.startDate || ""))
    .slice(0, 50)
    .map((task) => ({
      id: task.id,
      projectId: task.projectId,
      title: task.title,
      project: projectNames.get(task.projectId) || "滴答清单",
      dueDate: task.dueDate || task.startDate,
      done: false,
    }));
  return NextResponse.json({
    view,
    projects: projectsToRead.map(({ id, name }) => ({ id, name })),
    tasks,
  });
}

export async function POST(request: Request) {
  const token = await accessToken();
  if (!token) return new NextResponse("Not connected", { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (typeof body.title !== "string" || typeof body.projectId !== "string") return new NextResponse("Invalid task", { status: 400 });
  const requestedDate = typeof body.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)
    ? body.dueDate
    : "";
  const dueDate = requestedDate ? `${requestedDate}T23:59:00+0800` : undefined;
  const response = await tickFetch("/task", token, {
    method: "POST",
    body: JSON.stringify({
      title: body.title.trim(),
      projectId: body.projectId,
      ...(dueDate ? { dueDate } : {}),
      isAllDay: true,
      timeZone: "Asia/Shanghai",
    }),
  });
  return new NextResponse(await response.text(), { status: response.status, headers: { "Content-Type": "application/json" } });
}
