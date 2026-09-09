export type MusicTrack = {
  title: string;
  artist: string;
  cover?: string;
  url?: string;
  duration?: number;
  position?: number;
};
export type MusicMember = {
  id: string;
  name: string;
  sharing: boolean;
  connected: boolean;
  online?: boolean;
  state: "playing" | "paused" | "idle" | "unavailable";
  track?: MusicTrack;
};
export type MusicInvitation = {
  id: string;
  from: string;
  to: string;
  leader: string;
  title: string;
  url: string;
  mode: "external" | "sync";
  status: "pending" | "accepted" | "declined" | "cancelled" | "expired";
  expires: number;
};
export type MusicSession = {
  verified: true;
  leader: string;
  track: MusicTrack;
  playing: boolean;
  canControl: boolean;
};
export type MusicSnapshot = {
  selfId: string;
  members: MusicMember[];
  invitation?: MusicInvitation;
  session?: MusicSession;
  capabilities: { liveStatus: boolean; sync: boolean };
  sharing: boolean;
};
export type MusicCommand =
  | { action: "sharing"; enabled: boolean }
  | {
      action: "invite";
      to: string;
      title: string;
      url: string;
      leader?: string;
    }
  | { action: "accept" | "decline" | "cancel"; id: string }
  | { action: "end" | "play" | "pause" };

export function musicStatus(member?: MusicMember, own = false) {
  if (!member) return "对方尚未加入";
  if (!own && !member.sharing) return "未共享听歌状态";
  if (member.online === false) return "对方离线";
  if (!member.connected)
    return own ? "连接网易云，分享此刻的歌" : "状态暂不可用";
  if (member.state === "unavailable") return "状态暂不可用";
  if (member.state === "idle") return "暂未播放";
  return member.state === "paused" ? "已暂停" : "正在播放";
}

export function visibleTrack(member?: MusicMember, own = false) {
  return member &&
    (own || member.sharing) &&
    member.connected &&
    member.online !== false &&
    ["playing", "paused"].includes(member.state)
    ? member.track
    : undefined;
}

export function neteaseInvitationUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 1800) return null;
  try {
    const url = new URL(value.trim());
    // Never fetch this URL server-side. Navigation is always an explicit click.
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !["music.163.com", "y.music.163.com", "st.music.163.com"].includes(
        url.hostname,
      )
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
