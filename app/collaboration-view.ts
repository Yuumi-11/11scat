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
