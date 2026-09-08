type NoticeStorage = Pick<Storage, "getItem" | "setItem">;

// Scoped to the signed-in member and this browser. No task contents are stored.
// The first successful observation establishes a baseline, so upgrading does
// not turn every historical public task into a new-task notification.
export function createPublicTaskNotice(storage: () => NoticeStorage, memberId: string) {
  const key = `11scat-public-tasks-seen-v1:${memberId}`;
  let seen: Set<string> | null = null;
  return {
    observe(ids: string[], viewed = false): number {
      try {
        const saved: unknown = JSON.parse(storage().getItem(key) || "null");
        if (Array.isArray(saved) && saved.every(id => typeof id === "string")) {
          seen = new Set([...(seen || []), ...saved]);
        }
      } catch { /* Keep session state if storage is blocked or malformed. */ }
      const first = seen === null;
      seen ||= new Set<string>();
      if (first || viewed) for (const id of ids) seen.add(id);
      try { storage().setItem(key, JSON.stringify([...seen])); }
      catch { /* Notifications still work until this page is reloaded. */ }
      return new Set(ids.filter(id => !seen!.has(id))).size;
    },
  };
}
