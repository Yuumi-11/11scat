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
export function fittingChalkTaskCount(heights: number[], availableHeight: number, gap: number): number {
  let used = 0;
  for (let index = 0; index < heights.length; index++) {
    const next = used + heights[index] + (index ? gap : 0);
    if (next > availableHeight + 0.5) return index;
    used = next;
  }
  return heights.length;
}
