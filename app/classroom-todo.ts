import { classroomDay } from './classroom-view.ts';

const DAY = 86_400_000;
export type TodoTask = { id: string; title: string; dueDate?: string; isAllDay?: boolean; done: boolean; completedDay?: string };
export function classroomTodoWindow(now: Date | number = Date.now()) {
  const time = Number(now);
  const todaySix = Date.parse(`${classroomDay(time)}T06:00:00+08:00`);
  const start = time >= todaySix ? todaySix : todaySix - DAY;
  return { day: classroomDay(start), start, end: start + DAY, next: start + DAY };
}
export function todoDueTime(task: Pick<TodoTask, 'dueDate' | 'isAllDay'>) {
  const date = task.dueDate;
  if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) return NaN;
  // An all-day task belongs to its written date in the room timezone.
  return task.isAllDay || date.length === 10 ? Date.parse(`${date.slice(0, 10)}T23:59:59.999+08:00`) : Date.parse(date);
}
export function classroomTodoTasks<T extends TodoTask>(tasks: T[], now: Date | number = Date.now()): T[] {
  const window = classroomTodoWindow(now);
  return tasks.filter(task => {
    const due = todoDueTime(task);
    return Number.isFinite(due) && due >= window.start && due < window.end;
  });
}
export function mergeTodoSnapshot<T extends TodoTask>(previous: T[], incoming: T[], now = Date.now()): T[] {
  const done = classroomTodoTasks(previous.filter(task => task.done), now);
  const selected = classroomTodoTasks(incoming, now);
  // The same id with a new date can be a recurring task's next occurrence.
  const current = selected.map(task => done.find(old => old.id === task.id && old.dueDate === task.dueDate) || task);
  return [...current, ...done.filter(old => !current.some(task => task.id === old.id))];
}
