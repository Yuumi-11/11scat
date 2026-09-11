import path from "node:path";
import { TaskAttachmentStore } from "./store";

const directory = process.env.DATA_DIR || (process.env.NODE_ENV === 'production' ? '/data' : path.join(process.cwd(), '.data'));
const shared = globalThis as typeof globalThis & { taskAttachmentStore?: TaskAttachmentStore };
export const taskAttachments = shared.taskAttachmentStore ||= new TaskAttachmentStore(directory);
