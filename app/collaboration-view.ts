type DatedTask = { dueDate: string | null; startDate: string | null };

// Match the task board: deadline first, otherwise the scheduled start.
export function collaborationDate(task: DatedTask): string | null {
  return [task.dueDate, task.startDate].find(date => date && Number.isFinite(Date.parse(date))) || null;
}

export function splitCollaborationTasks<T extends DatedTask>(tasks: readonly T[]): { dated: T[]; undated: T[] } {
  const dated: T[] = [], undated: T[] = [];
  for (const task of tasks) (collaborationDate(task) ? dated : undated).push(task);
  dated.sort((a, b) => Date.parse(collaborationDate(a)!) - Date.parse(collaborationDate(b)!));
  return { dated, undated };
}

/** Calendar labels follow Shanghai dates and Monday-based calendar weeks. */
export function collaborationDateLabel(task: DatedTask & { isAllDay: boolean }, now = new Date()): string {
  const value = collaborationDate(task);
  if (!value) return "";
  const date = new Date(value);
  const localDay = (value: Date) => Math.floor((value.getTime() + 8 * 3600000) / 86400000);
  const today = localDay(now), target = localDay(date), delta = target - today;
  const weekday = (day: number) => (day + 3) % 7;
  const weekStart = today - weekday(today);
  let label: string;
  if (delta >= 0 && delta <= 3) label = ["今天", "明天", "后天", "大后天"][delta];
  else if (target >= weekStart && target < weekStart + 14) label = `${target < weekStart + 7 ? "这周" : "下周"}${["一", "二", "三", "四", "五", "六", "日"][weekday(target)]}`;
  else label = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric" }).format(date);
  return task.isAllDay ? label : `${label} ${new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date)}`;
}
