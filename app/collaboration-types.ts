export type TaskFields = {
  title: string; content: string; priority: 0 | 1 | 3 | 5;
  startDate: string | null; dueDate: string | null; isAllDay: boolean; timeZone: string;
  tags: string[]; reminders: string[]; repeatFlag: string; repeatFrom: string; desc: string; kind: string; items: Record<string, unknown>[];
};
export type RoomTask = TaskFields & { id: string; ownerId: string | null; version: string; pending?: string; transferBlocked?: string };
export type CollaborationMember = { id: string; name: string; connected: boolean; error?: string; diagnostic?: string; tasks: RoomTask[] };
export type OperationView = { id: string; actorId: string; title: string; action: string; from: string | null; to: string | null; status: "pending" | "done" | "cancelled"; error: string; createdAt?: number; updatedAt: number };
export type CollaborationSnapshot = { identityId: string; revision: number; buffer: RoomTask[]; members: CollaborationMember[]; operations: OperationView[] };
export type TaskSource = { ownerId: string | null; taskId: string; version: string };
export type CollaborationCommand = { id: string; action: "create" | "update" | "move" | "complete" | "delete"; source?: TaskSource; destination?: string | null; fields?: Partial<TaskFields> };
