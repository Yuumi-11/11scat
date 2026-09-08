const kind = (value: unknown): string => value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const idKind = (value: unknown) => typeof value !== "string" ? kind(value) : value === "inbox" ? "inbox-alias" : /^[A-Za-z0-9_-]{1,100}$/.test(value) ? "concrete-id" : "other-string";

// Report only known field types/counts, never identifiers, task text or credentials.
export function inboxResponseShape(value: unknown) {
  const root = record(value), project = record(root.project);
  const tasks = Array.isArray(root.tasks) ? root.tasks : [];
  const ids = tasks.map(task => record(task).projectId);
  return {
    rootType: kind(value),
    fields: Object.fromEntries(["project", "tasks", "columns", "data", "id", "projectId", "errorCode", "error", "message"].map(key => [key, kind(root[key])])),
    project: { id: idKind(project.id), topLevelId: idKind(root.id), topLevelProjectId: idKind(root.projectId) },
    tasks: { count: tasks.length, concreteProjectIds: new Set(ids.filter(id => idKind(id) === "concrete-id")).size, aliasCount: ids.filter(id => id === "inbox").length, missingProjectIdCount: ids.filter(id => id == null).length },
  };
}
