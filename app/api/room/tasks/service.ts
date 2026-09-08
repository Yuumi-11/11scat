import path from "node:path";
import { CollaborationStore } from "./store";
import { gateway } from "./provider";

export const collaborationDirectory = process.env.DATA_DIR || (process.env.NODE_ENV === "production" ? "/data" : path.join(process.cwd(), ".data"));
// Route bundles must share the same write queue, including the sidebar endpoint.
const shared = globalThis as typeof globalThis & { roomCollaborationStore?: CollaborationStore };
export const store = shared.roomCollaborationStore ||= new CollaborationStore(collaborationDirectory, gateway);
