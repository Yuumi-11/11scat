import { claimDueRings, listRings, setRingDelivery } from "./store";
import { sendRingPush } from "../../push/store";

const state = globalThis as typeof globalThis & { roomBellTimer?: ReturnType<typeof setTimeout>; roomBellRunning?: boolean };
export async function tickRings() {
  if (state.roomBellRunning) return;
  state.roomBellRunning = true;
  try {
    const due = await claimDueRings();
    await Promise.all(due.map(async ring => {
      const latest = (await listRings(ring.senderId)).find(r => r.id === ring.id);
      if (!latest || latest.state !== "active") return;
      try { await setRingDelivery(ring.id, await sendRingPush(ring)); }
      catch { await setRingDelivery(ring.id, "failed"); }
    }));
  } finally { state.roomBellRunning = false; }
}
export function startRingScheduler() {
  if (state.roomBellTimer) return;
  const run = async () => {
    try { await tickRings(); } catch { console.error("ring-scheduler: tick failed"); }
    state.roomBellTimer = setTimeout(run, 500);
    state.roomBellTimer.unref();
  };
  state.roomBellTimer = setTimeout(run, 500);
  state.roomBellTimer.unref();
}
