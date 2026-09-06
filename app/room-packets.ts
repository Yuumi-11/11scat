// LiveKit reliable packets have a finite payload budget. Split large strokes
// and snapshots into bounded UTF-8 chunks, then apply only complete messages.
type Packet = { type: "board-chunk"; id: string; index: number; total: number; data: string };

export function encodeRoomPackets(message: object): object[] {
  const bytes = new TextEncoder().encode(JSON.stringify(message));
  if (bytes.length <= 8000) return [message];
  const id = crypto.randomUUID();
  const total = Math.ceil(bytes.length / 6000);
  if (total > 2048) throw new Error("画板数据过大，请分成多个画板");
  return Array.from({ length: total }, (_, index): Packet => ({
    type: "board-chunk", id, index, total,
    data: btoa(String.fromCharCode(...bytes.subarray(index * 6000, (index + 1) * 6000))),
  }));
}

export function createPacketReceiver() {
  const pending = new Map<string, { chunks: Map<number, Uint8Array>; total: number; time: number }>();
  return (value: unknown): object | null => {
    const packet = value as Partial<Packet>;
    if (!packet || packet.type !== "board-chunk") return null;
    const now = Date.now();
    for (const [id, item] of pending) if (now - item.time > 30_000) pending.delete(id);
    if (typeof packet.id !== "string" || packet.id.length > 80 || !Number.isInteger(packet.index) || !Number.isInteger(packet.total)
      || packet.total! < 1 || packet.total! > 2048 || packet.index! < 0 || packet.index! >= packet.total!
      || typeof packet.data !== "string" || packet.data.length > 8000) return null;
    let item = pending.get(packet.id);
    if (!item) {
      if (pending.size >= 32) return null;
      item = { chunks: new Map(), total: packet.total!, time: now };
      pending.set(packet.id, item);
    }
    if (item.total !== packet.total) return null;
    try {
      item.chunks.set(packet.index!, Uint8Array.from(atob(packet.data), (char) => char.charCodeAt(0)));
      if (item.chunks.size !== item.total) return null;
      pending.delete(packet.id);
      const bytes = new Uint8Array([...item.chunks.values()].reduce((size, part) => size + part.length, 0));
      let offset = 0;
      for (let i = 0; i < item.total; i++) { const part = item.chunks.get(i)!; bytes.set(part, offset); offset += part.length; }
      return JSON.parse(new TextDecoder().decode(bytes)) as object;
    } catch { pending.delete(packet.id); return null; }
  };
}
