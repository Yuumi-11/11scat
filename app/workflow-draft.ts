import type { TaskFields } from './collaboration-types';

// Rebase only the fields the editor changed; a nudge does not change task fields.
export function rebaseWorkflowDraft(base: TaskFields, draft: TaskFields, latest: TaskFields) {
  const patch: Partial<TaskFields> = {}, conflicts: (keyof TaskFields)[] = [];
  const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  for (const key of Object.keys(draft) as (keyof TaskFields)[]) {
    if (equal(base[key], draft[key])) continue;
    Object.assign(patch, { [key]: draft[key] });
    if (!equal(base[key], latest[key]) && !equal(draft[key], latest[key])) conflicts.push(key);
  }
  return { patch, conflicts };
}
