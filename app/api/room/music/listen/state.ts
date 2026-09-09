import { randomUUID } from "node:crypto";
export type ListenerMember = {
  id: string;
  name: string;
  connected: boolean;
  sharing: boolean;
};
export type ListenInvite = {
  id: string;
  from: string;
  to: string;
  leader: string;
  expires: number;
  status: "pending" | "accepted";
  ready: string[];
  signal?: { offer: string; answer?: string };
};
type Device = {
  owner: string;
  connected: boolean;
  sharing: boolean;
  at: number;
};
export class ListenError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export function createListenState(now = Date.now) {
  const devices = new Map<string, Device>();
  const invitations = new Map<string, ListenInvite>();
  const live = (id: string) => {
    const d = devices.get(id);
    return d && now() - d.at < 16000 ? d : undefined;
  };
  const prune = () => {
    for (const [id, i] of invitations)
      if (i.expires <= now()) invitations.delete(id);
  };
  function view(actor: string, people: { id: string; name: string }[]) {
    prune();
    return {
      selfId: actor,
      members: people.map((p) => ({
        ...p,
        connected:
          (p.id === actor || !!live(p.id)?.sharing) && !!live(p.id)?.connected,
        sharing: !!live(p.id)?.sharing,
      })),
      invitation: [...invitations.values()].find(
        (i) => i.from === actor || i.to === actor,
      ),
    };
  }
  function command(
    actor: string,
    body: Record<string, unknown>,
    people: { id: string; name: string }[],
  ) {
    prune();
    if (!people.some((p) => p.id === actor))
      throw new ListenError("请重新登录", 401);
    const existing = [...invitations.values()].find(
      (i) => i.from === actor || i.to === actor,
    );
    const device =
      typeof body.device === "string" &&
      /^[a-zA-Z0-9-]{16,64}$/.test(body.device)
        ? body.device
        : null;
    if (body.action === "heartbeat") {
      if (!device) throw new ListenError("设备标识无效");
      const old = live(actor);
      if (
        old &&
        old.owner !== device &&
        old.connected &&
        body.connected === true
      )
        throw new ListenError("另一个窗口已连接音乐，请先断开", 409);
      if (!old || old.owner === device || body.connected === true)
        devices.set(actor, {
          owner: device,
          connected: body.connected === true,
          sharing: body.connected === true && body.sharing === true,
          at: now(),
        });
    } else if (body.action === "invite") {
      const target = people.find((p) => p.id === body.to && p.id !== actor);
      if (!target) throw new ListenError("请选择对方");
      if (
        existing ||
        [...invitations.values()].some(
          (i) => i.from === target.id || i.to === target.id,
        )
      )
        throw new ListenError("已有邀请或一起听会话", 409);
      const leader =
        body.leader === actor
          ? actor
          : body.leader === target.id
            ? target.id
            : null;
      if (!leader || !live(leader)?.connected || !live(leader)?.sharing)
        throw new ListenError("分享方尚未开启音乐分享", 409);
      const i: ListenInvite = {
        id: randomUUID(),
        from: actor,
        to: target.id,
        leader,
        expires: now() + 120000,
        status: "pending",
        ready: [],
      };
      invitations.set(i.id, i);
    } else if (
      ["accept", "decline", "cancel", "end", "ready", "signal"].includes(
        String(body.action),
      )
    ) {
      if (!existing || existing.id !== body.id)
        throw new ListenError("邀请已结束", 409);
      if (body.action === "accept" || body.action === "decline") {
        if (existing.to !== actor || existing.status !== "pending")
          throw new ListenError("无权处理此邀请", 403);
        if (body.action === "decline") invitations.delete(existing.id);
        else {
          if (!live(existing.leader)?.sharing)
            throw new ListenError("分享方已断开", 409);
          existing.status = "accepted";
          existing.expires = now() + 20000;
        }
      } else if (body.action === "end" || body.action === "cancel") {
        if (body.action === "cancel" && existing.from !== actor)
          throw new ListenError("无权取消", 403);
        invitations.delete(existing.id);
      } else {
        if (existing.status !== "accepted" || !live(existing.leader)?.sharing)
          throw new ListenError("分享已停止", 409);
        if (body.action === "signal") {
          if (
            typeof body.sdp !== "string" ||
            body.sdp.length > 65536 ||
            !body.sdp.startsWith("v=0")
          )
            throw new ListenError("音频连接参数无效");
          if (body.kind === "offer" && actor === existing.leader) {
            existing.signal = { offer: body.sdp };
            existing.ready = [];
          } else if (
            body.kind === "answer" &&
            actor !== existing.leader &&
            existing.signal
          ) {
            existing.signal.answer = body.sdp;
          } else throw new ListenError("无权发送连接参数", 403);
        }
        if (body.action === "ready" && !existing.ready.includes(actor))
          existing.ready.push(actor);
      }
    } else throw new ListenError("未知操作");
    // Both endpoints must keep acknowledging their current invitation. Closing a browser expires the session.
    if (
      body.action === "heartbeat" &&
      existing?.status === "accepted" &&
      body.id === existing.id
    ) {
      if (body.receiving !== true)
        existing.ready = existing.ready.filter((id) => id !== actor);
      const marker = existing as ListenInvite & {
        beats?: Record<string, number>;
      };
      marker.beats ||= {};
      marker.beats[actor] = now();
      if (
        marker.beats[existing.from] &&
        marker.beats[existing.to] &&
        now() - marker.beats[existing.from] < 16000 &&
        now() - marker.beats[existing.to] < 16000
      )
        existing.expires = now() + 20000;
    }
    return view(actor, people);
  }
  return { view, command };
}
