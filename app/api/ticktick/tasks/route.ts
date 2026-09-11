import { NextResponse } from "next/server";
import { accessToken } from "../store";
import { classroomDay, todayTasks } from "../../../classroom-view";
import { classroomTodoTasks, classroomTodoWindow } from '../../../classroom-todo';
import { currentIdentityId } from '../../identity/session';
import { todoStore } from '../../room/todo/store';

import { tickFetch, tickInboxData, filterTasksByView, type TickProject, type TickTask, type TaskView } from "../client";

export async function GET(request: Request) {
  const token = await accessToken();
  if (!token) return new NextResponse("Not connected", { status: 401 });
  const projectResponse = await tickFetch("/project", token);
  if (!projectResponse.ok) return new NextResponse("TickTick unavailable", { status: projectResponse.status });

  const projects: TickProject[] = await projectResponse.json();
  const activeProjects = projects.filter((project) => !project.closed);
  let inbox: { projectId: string; tasks: TickTask[] } | null = null;
  let inboxError = "";
  try { inbox = await tickInboxData(token); }
  catch (error) { inboxError = error instanceof Error ? error.message : "收集箱暂时无法读取"; }
  const inboxId = inbox?.projectId || "";
  const projectsToRead = inboxId && !activeProjects.some((project) => project.id === inboxId)
    ? [...activeProjects, { id: inboxId, name: "收集箱" }]
    : activeProjects;
  const datasetResponses = await Promise.all(projectsToRead.map(async (project) => {
    if (inbox && project.id === inbox.projectId) return { ok: true as const, projectId: inbox.projectId, tasks: inbox.tasks };
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
  const uniqueTasks = new Map<string, TickTask>();
  for (const task of datasetResponses.flatMap((dataset) => dataset.tasks)) {
    if (task && typeof task.id === "string") uniqueTasks.set(task.id, task);
  }
  const requestedView = new URL(request.url).searchParams.get("view");
  const view: TaskView = requestedView === "today" ? "today" : requestedView === "undated" ? "undated" : "week";
  const classroom = view === 'today' && new URL(request.url).searchParams.get('classroom') === '1';
  const exactToday = view === "today" && new URL(request.url).searchParams.get("exact") === "1";
  const now = Date.now();
  let historyWarning = '';
  if (classroom) {
    try {
      const response = await tickFetch('/task/completed', token, { method: 'POST', body: JSON.stringify({}) });
      const history = response.ok ? await response.json() : null;
      if (!Array.isArray(history)) throw new Error('history unavailable');
      if (history.length >= 200) historyWarning = '滴答完成记录可能达到返回上限，较早的外部完成项可能尚未列出';
      for (const item of history) {
        if (!item || typeof item.id !== 'string' || typeof item.title !== 'string' || item.status !== 2) continue;
        if (!uniqueTasks.has(item.id)) uniqueTasks.set(item.id, item);
      }
    } catch { historyWarning = '滴答历史暂时无法读取，已保留本站当天勾选的任务'; }
  }
  const sourceTasks = [...uniqueTasks.values()];
  const normalizeTodo = (task: TickTask & { completedTime?: string }) => ({ ...task, dueDate: task.dueDate || task.startDate, done: !!task.status,
    completedDay: task.completedTime && Number.isFinite(Date.parse(task.completedTime)) ? classroomTodoWindow(Date.parse(task.completedTime)).day : undefined });
  const filtered = classroom
    ? classroomTodoTasks(sourceTasks.map(normalizeTodo), now)
    : exactToday
    ? todayTasks(sourceTasks.map(task => ({ ...task, dueDate: task.dueDate || task.startDate, done: !!task.status })), classroomDay()).sort((a, b) => Date.parse(a.dueDate || "") - Date.parse(b.dueDate || ""))
    : filterTasksByView(sourceTasks, view);
  let tasks = filtered
    .map((task) => ({
      id: task.id,
      projectId: task.projectId,
      title: task.title,
      project: projectNames.get(task.projectId) || "滴答清单",
      dueDate: task.dueDate || task.startDate,
      isAllDay: task.isAllDay,
      done: classroom ? !!task.status : false,
      ...(classroom ? { completedDay: normalizeTodo(task).completedDay } : {}),
    }));
  if (classroom) {
    const identity = await currentIdentityId();
    if (!identity) return new NextResponse('Unauthorized', { status: 401 });
    tasks = await todoStore.reconcile(identity, tasks, now) as typeof tasks;
  }
  return NextResponse.json({
    view,
    ...(inboxError || historyWarning ? { inboxError: [inboxError, historyWarning].filter(Boolean).join('；') } : {}),
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
