import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { decryptToken } from "../crypto";

type TickProject = { id: string; name: string; closed?: boolean };
type TickTask = { id: string; projectId: string; title: string; status?: number; dueDate?: string };

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

export async function GET() {
  const token = await accessToken();
  if (!token) return new NextResponse("Not connected", { status: 401 });
  const projectResponse = await tickFetch("/project", token);
  if (!projectResponse.ok) return new NextResponse("TickTick unavailable", { status: projectResponse.status });

  const projects: TickProject[] = await projectResponse.json();
  const activeProjects = projects.filter((project) => !project.closed);
  const datasets = await Promise.all(activeProjects.map(async (project) => {
    const response = await tickFetch(`/project/${encodeURIComponent(project.id)}/data`, token);
    if (!response.ok) return [] as TickTask[];
    const data = await response.json();
    return (data.tasks || []) as TickTask[];
  }));

  const projectNames = new Map(activeProjects.map((project) => [project.id, project.name]));
  const sevenDaysFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const tasks = datasets
    .flat()
    .filter((task) => {
      if (task.status || !task.dueDate) return false;
      const dueAt = Date.parse(task.dueDate);
      return Number.isFinite(dueAt) && dueAt <= sevenDaysFromNow;
    })
    .sort((a, b) => Date.parse(a.dueDate || "") - Date.parse(b.dueDate || ""))
    .slice(0, 50)
    .map((task) => ({
      id: task.id,
      projectId: task.projectId,
      title: task.title,
      project: projectNames.get(task.projectId) || "滴答清单",
      dueDate: task.dueDate,
      done: false,
    }));
  return NextResponse.json({
    view: "next-seven-days",
    projects: activeProjects.map(({ id, name }) => ({ id, name })),
    tasks,
  });
}

export async function POST(request: Request) {
  const token = await accessToken();
  if (!token) return new NextResponse("Not connected", { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (typeof body.title !== "string" || typeof body.projectId !== "string") return new NextResponse("Invalid task", { status: 400 });
  const todayInShanghai = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const dueDate = `${todayInShanghai}T23:59:00+0800`;
  const response = await tickFetch("/task", token, {
    method: "POST",
    body: JSON.stringify({
      title: body.title.trim(),
      projectId: body.projectId,
      dueDate,
      isAllDay: true,
      timeZone: "Asia/Shanghai",
    }),
  });
  return new NextResponse(await response.text(), { status: response.status, headers: { "Content-Type": "application/json" } });
}
