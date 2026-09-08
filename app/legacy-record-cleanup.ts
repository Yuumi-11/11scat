type LegacyState = {
  revision: number;
  operations: Record<string, { action: string }>;
  buffer: Record<string, { stagedBy?: string }>;
  legacyCleanup?: unknown[];
  legacyReset?: boolean;
};

/** Delete obsolete transfer history only; keep task data and approval workflows. */
export function clearLegacyRecords(state: LegacyState) {
  const ids = new Set(Object.entries(state.operations).filter(([, op]) => op.action === "move").map(([id]) => id));
  let changed = ids.size > 0 || !!state.legacyCleanup?.length || state.legacyReset !== true;
  for (const id of ids) delete state.operations[id];
  for (const task of Object.values(state.buffer)) {
    if (task.stagedBy && ids.has(task.stagedBy)) { delete task.stagedBy; changed = true; }
  }
  delete state.legacyCleanup;
  state.legacyReset = true;
  if (changed) state.revision++;
  return { changed, removed: ids.size };
}
