export type PublicTaskPreview = { id: string; title: string };
const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
export function classroomDay(now: Date | number = Date.now()): string {
  return dayFormatter.format(now);
}
// TickTick all-day dates are date labels; timed dates use the same room timezone
// on both devices, including offsets crossing midnight.
export function taskDay(date: string | undefined, allDay = false): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) return '';
  if (allDay || date.length === 10) return date.slice(0, 10);
  const value = Date.parse(date);
  return Number.isFinite(value) ? classroomDay(value) : '';
}
export function todayTasks<T extends { dueDate?: string; done: boolean; isAllDay?: boolean }>(tasks: T[], day: string): T[] {
  return tasks.filter(task => !task.done && taskDay(task.dueDate, task.isAllDay) === day);
}
export function chalkTaskPreview(tasks: PublicTaskPreview[]): PublicTaskPreview[] {
  // A very long first title receives the available writing space on its own.
  const result: PublicTaskPreview[] = []; let lines = 0;
  for (const task of tasks) {
    if (!task.title.trim()) continue;
    const estimated = Math.min(3, Math.max(1, Math.ceil(Array.from(task.title).length / 22)));
    if (result.length && lines + estimated > 5) break;
    result.push(task); lines += estimated;
    if (result.length === 3) break;
  }
  return result;
}
