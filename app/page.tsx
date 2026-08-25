"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import type { DataConnection, MediaConnection, Peer as PeerClient, PeerOptions } from "peerjs";

type Task = {
  id: string;
  projectId?: string;
  title: string;
  project: string;
  dueDate?: string;
  done: boolean;
  source: "ticktick" | "local";
};

type Project = { id: string; name: string };
type ChatMessage = { id: string; body: string; time: string; sender: string; own?: boolean };
type MediaSource = "camera" | "screen";
type MediaItem = {
  id: string;
  label: string;
  stream: MediaStream;
  kind: MediaSource;
  remote: boolean;
};

const USE_LIVEKIT = false;

const pad = (value: number) => String(value).padStart(2, "0");
const localDateInputValue = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const formatDueDate = (dueDate?: string) => {
  if (!dueDate) return "";
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return "";
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const dayOffset = Math.round((dueStart - todayStart) / (24 * 60 * 60 * 1000));
  if (dayOffset < 0) return `已逾期 ${Math.abs(dayOffset)} 天`;
  if (dayOffset === 0) return "今天";
  if (dayOffset === 1) return "明天";
  return `${due.getMonth() + 1}月${due.getDate()}日`;
};

function MediaVideo({ stream, label, className, muted = true }: { stream: MediaStream; label: string; className: string; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);

  return <video className={className} ref={ref} autoPlay muted={muted} playsInline aria-label={label} />;
}

function DatePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => value ? new Date(`${value}T12:00:00`) : new Date());
  const pickerRef = useRef<HTMLDivElement>(null);
  const selectedDate = value ? new Date(`${value}T12:00:00`) : null;
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const leading = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - leading + 1;
    return new Date(year, month, day);
  });
  const sameDay = (left: Date | null, right: Date) => Boolean(left && left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate());
  const today = new Date();
  const displayValue = selectedDate ? `${selectedDate.getFullYear()}年${selectedDate.getMonth() + 1}月${selectedDate.getDate()}日` : "选择截止日期";

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return <div className="date-picker" ref={pickerRef}>
    <button className="date-trigger" type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-haspopup="dialog">
      <span>截止日期</span><strong>{displayValue}</strong><span className="date-chevron">⌄</span>
    </button>
    {open && <div className="date-popover" role="dialog" aria-label="选择截止日期">
      <div className="date-popover-head"><button type="button" onClick={() => setViewDate(new Date(year, month - 1, 1))} aria-label="上个月">‹</button><strong>{year}年{month + 1}月</strong><button type="button" onClick={() => setViewDate(new Date(year, month + 1, 1))} aria-label="下个月">›</button></div>
      <div className="date-weekdays">{["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="date-grid">{cells.map((date, index) => {
        const inMonth = index >= leading && index < leading + daysInMonth;
        const dateValue = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
        return <button className={`${inMonth ? "" : "muted"}${sameDay(selectedDate, date) ? " selected" : ""}${sameDay(today, date) ? " today" : ""}`} type="button" key={dateValue} onClick={() => { if (inMonth) { onChange(dateValue); setOpen(false); } }} disabled={!inMonth}>{date.getDate()}</button>;
      })}</div>
      <div className="date-popover-foot"><button type="button" onClick={() => { onChange(""); setOpen(false); }}>清除</button><button type="button" onClick={() => { const current = new Date(); onChange(`${current.getFullYear()}-${pad(current.getMonth() + 1)}-${pad(current.getDate())}`); setViewDate(current); setOpen(false); }}>今天</button></div>
    </div>}
  </div>;
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [taskDueDate, setTaskDueDate] = useState(localDateInputValue);
  const [draft, setDraft] = useState("");
  const [shareMode, setShareMode] = useState<"detail" | "motion">("detail");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [shareError, setShareError] = useState("");
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [roomMembers, setRoomMembers] = useState<string[]>([]);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [displayName, setDisplayName] = useState("");
  const [joined, setJoined] = useState(false);
  const [remoteCameras, setRemoteCameras] = useState<Record<string, MediaStream>>({});
  const [remoteScreens, setRemoteScreens] = useState<Record<string, MediaStream>>({});
  const [activeMediaId, setActiveMediaId] = useState("");
  const [roomStatus, setRoomStatus] = useState<"connecting" | "ready" | "error">("connecting");
  const [roomError, setRoomError] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const [syncing, setSyncing] = useState(true);
  const [syncError, setSyncError] = useState("");
  const [token, setToken] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [sideView, setSideView] = useState<"chat" | "members">("chat");
  const [leftView, setLeftView] = useState<"tasks" | "members">("tasks");
  const roomRef = useRef<Room | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<PeerClient | null>(null);
  const selfPeerIdRef = useRef("");
  const hostPeerIdRef = useRef("");
  const dataConnectionsRef = useRef(new Map<string, DataConnection>());
  const messagesRef = useRef<ChatMessage[]>([]);
  const outgoingCallsRef = useRef(new Map<string, MediaConnection>());
  const incomingCallsRef = useRef(new Map<string, MediaConnection>());
  const callPeerRef = useRef<(peerId: string, media: MediaStream, source: MediaSource) => void>(() => undefined);
  const displayNameRef = useRef("");
  const memberNamesRef = useRef<Record<string, string>>({});

  const loadTasks = async () => {
    setSyncing(true);
    setSyncError("");
    try {
      const response = await fetch("/api/ticktick/tasks", { cache: "no-store" });
      if (response.status === 401) {
        setConnected(false);
        setTasks((current) => current.filter((task) => task.source === "local"));
        return;
      }
      if (!response.ok) throw new Error("暂时无法读取滴答清单");
      const data = await response.json();
      const remoteTasks: Task[] = data.tasks.map((task: Task) => ({ ...task, source: "ticktick" }));
      setConnected(true);
      setProjects(data.projects);
      const preferredProject = data.projects.find((project: Project) => /工作/.test(project.name))
        || data.projects.find((project: Project) => !/欢迎/.test(project.name))
        || data.projects[0];
      setSelectedProject(preferredProject?.id || "");
      setTasks((current) => [...remoteTasks, ...current.filter((task) => task.source === "local")]);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "同步失败");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => { void loadTasks(); }, []);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { displayNameRef.current = displayName.trim(); }, [displayName]);
  useEffect(() => { memberNamesRef.current = memberNames; }, [memberNames]);
  useEffect(() => () => stream?.getTracks().forEach((track) => track.stop()), [stream]);
  useEffect(() => () => cameraStream?.getTracks().forEach((track) => track.stop()), [cameraStream]);

  useEffect(() => {
    if (!joined || !USE_LIVEKIT) return;
    let disposed = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    const refreshMembers = () => {
      const participants = Array.from(room.remoteParticipants.values()).filter((participant) => participant.name !== "11scat member");
      setRoomMembers(participants.map((participant) => participant.identity));
      setMemberNames(Object.fromEntries(participants.map((participant) => [participant.identity, participant.name?.trim() || participant.identity])));
    };
    const removeRemote = (identity: string, source: MediaSource) => {
      const setter = source === "camera" ? setRemoteCameras : setRemoteScreens;
      setter((current) => { const next = { ...current }; delete next[identity]; return next; });
    };
    room.on(RoomEvent.ParticipantConnected, refreshMembers);
    room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      removeRemote(participant.identity, "camera");
      removeRemote(participant.identity, "screen");
      setMemberNames((current) => {
        const next = { ...current };
        delete next[participant.identity];
        return next;
      });
      refreshMembers();
    });
    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind !== Track.Kind.Video) return;
      const source: MediaSource = publication.source === Track.Source.ScreenShare ? "screen" : "camera";
      const setter = source === "camera" ? setRemoteCameras : setRemoteScreens;
      setter((current) => ({ ...current, [participant.identity]: new MediaStream([track.mediaStreamTrack]) }));
      refreshMembers();
    });
    room.on(RoomEvent.TrackUnsubscribed, (_track, publication, participant) => {
      if (publication.kind !== Track.Kind.Video) return;
      removeRemote(participant.identity, publication.source === Track.Source.ScreenShare ? "screen" : "camera");
    });
    room.on(RoomEvent.DataReceived, (payload, participant) => {
      try {
        const message = JSON.parse(new TextDecoder().decode(payload)) as ChatMessage & { type?: string };
        if (message.type !== "chat" || !message.id || !message.body || !message.time) return;
        setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, { ...message, sender: participant?.name?.trim() || message.sender || participant?.identity || "成员", own: false }]);
      } catch { /* ignore invalid room messages */ }
    });
    room.on(RoomEvent.Disconnected, () => {
      if (!disposed) { setRoomStatus("error"); setRoomError("实时房间连接已断开，请刷新后重试。"); }
    });
    const connect = async () => {
      try {
        const identityKey = "11scat-livekit-device-identity";
        let deviceIdentity = window.localStorage.getItem(identityKey);
        if (!deviceIdentity) {
          deviceIdentity = crypto.randomUUID();
          window.localStorage.setItem(identityKey, deviceIdentity);
        }
        const response = await fetch(`/api/livekit-token?name=${encodeURIComponent(displayName)}&identity=${encodeURIComponent(deviceIdentity)}`, { cache: "no-store" });
        if (!response.ok) throw new Error("LiveKit token unavailable");
        const { token, url } = await response.json() as { token: string; url: string };
        await room.connect(url, token);
        if (disposed) return;
        setInviteUrl(`${window.location.origin}${window.location.pathname}`);
        setRoomStatus("ready");
        setRoomError("");
        refreshMembers();
      } catch {
        if (!disposed) { setRoomStatus("error"); setRoomError("实时服务尚未完成配置，请稍后刷新重试。"); }
      }
    };
    void connect();
    return () => { disposed = true; room.disconnect(); roomRef.current = null; };
  }, [displayName, joined]);

  useEffect(() => {
    if (!joined || USE_LIVEKIT) return;
    let disposed = false;
    let localPeer: PeerClient | null = null;
    const connections = dataConnectionsRef.current;
    const outgoingCalls = outgoingCallsRef.current;
    const incomingCalls = incomingCallsRef.current;
    const mediaRetryCounts = new Map<string, number>();

    const rememberPeerName = (peerId: string, value: unknown) => {
      const name = typeof value === "string" ? value.trim().slice(0, 24) : "";
      if (!name) return;
      setMemberNames((current) => current[peerId] === name ? current : { ...current, [peerId]: name });
    };

    const refreshMembers = () => {
      setRoomMembers(Array.from(connections.keys()));
    };

    const removeRemoteMedia = (peerId: string, source: MediaSource) => {
      const setter = source === "camera" ? setRemoteCameras : setRemoteScreens;
      setter((current) => {
        if (!current[peerId]) return current;
        const next = { ...current };
        delete next[peerId];
        return next;
      });
    };

    const closePeerCalls = (peerId: string) => {
      (["camera", "screen"] as MediaSource[]).forEach((source) => {
        const key = `${source}:${peerId}`;
        outgoingCalls.get(key)?.close();
        incomingCalls.get(key)?.close();
        outgoingCalls.delete(key);
        incomingCalls.delete(key);
        removeRemoteMedia(peerId, source);
      });
    };

    const removePeer = (peerId: string) => {
      connections.delete(peerId);
      closePeerCalls(peerId);
      setMemberNames((current) => {
        if (!current[peerId]) return current;
        const next = { ...current };
        delete next[peerId];
        return next;
      });
      refreshMembers();
    };

    const callPeer = (peerId: string, media: MediaStream, source: MediaSource) => {
      if (!localPeer?.open || !connections.get(peerId)?.open) return;
      const key = `${source}:${peerId}`;
      const existing = outgoingCalls.get(key);
      if (existing?.open) return;
      existing?.close();

      const call = localPeer.call(peerId, media, { metadata: { source, name: displayNameRef.current } });
      outgoingCalls.set(key, call);
      const retry = () => {
        if (disposed || outgoingCalls.get(key) !== call) return;
        outgoingCalls.delete(key);
        call.close();
        const attempts = mediaRetryCounts.get(key) || 0;
        const currentStream = source === "camera" ? cameraStreamRef.current : screenStreamRef.current;
        if (!currentStream || attempts >= 3) return;
        mediaRetryCounts.set(key, attempts + 1);
        window.setTimeout(() => callPeer(peerId, currentStream, source), 900 * (attempts + 1));
      };
      window.setTimeout(() => {
        if (outgoingCalls.get(key) === call && !call.open) retry();
      }, 7000);
      call.on("close", () => {
        if (outgoingCalls.get(key) === call) outgoingCalls.delete(key);
      });
      call.on("error", retry);
    };

    callPeerRef.current = callPeer;

    const broadcastPeerList = () => {
      const selfId = selfPeerIdRef.current;
      if (!selfId || hostPeerIdRef.current !== selfId) return;
      const ids = [selfId, ...connections.keys()];
      connections.forEach((connection) => {
        if (connection.open) connection.send({ type: "peer-list", ids });
      });
    };

    function connectToPeer(peerId: string) {
      const selfId = selfPeerIdRef.current;
      if (!localPeer?.open || !peerId || peerId === selfId || connections.has(peerId) || connections.size >= 1) return;
      bindConnection(localPeer.connect(peerId, { reliable: true, metadata: { room: hostPeerIdRef.current, name: displayNameRef.current } }));
    }

    function bindConnection(connection: DataConnection) {
      const peerId = connection.peer;

      const handleOpen = () => {
        if (disposed) return;
        const existing = connections.get(peerId);
        if (!existing && connections.size >= 1) {
          connection.close();
          return;
        }
        if (existing && existing !== connection && existing.open) {
          connection.close();
          return;
        }

        connections.set(peerId, connection);
        rememberPeerName(peerId, connection.metadata?.name);
        setRoomError("");
        refreshMembers();
        connection.send({ type: "presence", name: displayNameRef.current });
        connection.send({ type: "media-request" });
        if (hostPeerIdRef.current === selfPeerIdRef.current && messagesRef.current.length) {
          connection.send({ type: "chat-history", messages: messagesRef.current.map(({ own: _own, ...message }) => message) });
        }
        if (hostPeerIdRef.current === selfPeerIdRef.current) broadcastPeerList();
        if (cameraStreamRef.current) callPeer(peerId, cameraStreamRef.current, "camera");
        if (screenStreamRef.current) callPeer(peerId, screenStreamRef.current, "screen");
      };

      connection.on("open", handleOpen);
      connection.on("data", (payload) => {
        if (!payload || typeof payload !== "object" || !("type" in payload)) return;
        const message = payload as { type: string; ids?: unknown; messages?: unknown; id?: unknown; body?: unknown; time?: unknown; sender?: unknown; name?: unknown };
        if (message.type === "presence") {
          rememberPeerName(peerId, message.name);
          return;
        }
        if (message.type === "media-request") {
          if (cameraStreamRef.current) callPeer(peerId, cameraStreamRef.current, "camera");
          if (screenStreamRef.current) callPeer(peerId, screenStreamRef.current, "screen");
          return;
        }
        if (message.type === "chat" && typeof message.id === "string" && typeof message.body === "string" && typeof message.time === "string") {
          const sender = typeof message.sender === "string" && message.sender.trim()
            ? message.sender.trim().slice(0, 24)
            : memberNamesRef.current[peerId] || "成员";
          const incomingMessage: ChatMessage = { id: message.id, body: message.body, time: message.time, sender };
          setMessages((current) => current.some((item) => item.id === incomingMessage.id) ? current : [...current, incomingMessage]);
          return;
        }
        if (message.type === "chat-history" && Array.isArray(message.messages)) {
          const history = message.messages.filter((item): item is ChatMessage => Boolean(item && typeof item === "object" && typeof (item as ChatMessage).id === "string" && typeof (item as ChatMessage).body === "string" && typeof (item as ChatMessage).time === "string"));
          setMessages((current) => {
            const known = new Set(current.map((item) => item.id));
            return [...current, ...history.filter((item) => !known.has(item.id))];
          });
          return;
        }
        if (message.type !== "peer-list" || !Array.isArray(message.ids)) return;

        const selfId = selfPeerIdRef.current;
        message.ids.forEach((candidate) => {
          if (typeof candidate !== "string" || candidate === selfId || connections.has(candidate)) return;
          if (candidate === hostPeerIdRef.current || selfId.localeCompare(candidate) < 0) connectToPeer(candidate);
        });
      });
      connection.on("close", () => {
        if (connections.get(peerId) !== connection) return;
        removePeer(peerId);
        if (hostPeerIdRef.current === selfPeerIdRef.current) broadcastPeerList();
      });
      connection.on("error", () => removePeer(peerId));
      if (connection.open) handleOpen();
    }

    const initializeRoom = async () => {
      try {
        const { Peer } = await import("peerjs");
        if (disposed) return;

        let peerOptions: PeerOptions = { debug: 1 };
        try {
          const response = await fetch("/api/realtime-config", { cache: "no-store" });
          const data = await response.json() as {
            iceServers?: RTCIceServer[];
            peerServer?: { path?: string; key?: string } | null;
          };
          if (Array.isArray(data.iceServers) && data.iceServers.length) {
            peerOptions = { debug: 1, config: { iceServers: data.iceServers } };
          }
          if (data.peerServer?.path) {
            const secure = window.location.protocol === "https:";
            peerOptions = {
              ...peerOptions,
              host: window.location.hostname,
              port: window.location.port ? Number(window.location.port) : secure ? 443 : 80,
              path: data.peerServer.path,
              key: data.peerServer.key || "peerjs",
              secure,
            };
          }
        } catch { /* STUN defaults remain available when TURN config cannot be loaded. */ }

        const requestedHost = new URL(window.location.href).searchParams.get("host") || "";
        const defaultRoomPeerId = "11scat-global-room";

        const handleCall = (call: MediaConnection) => {
          const peerId = call.peer;
          const source: MediaSource = call.metadata?.source === "screen" ? "screen" : "camera";
          rememberPeerName(peerId, call.metadata?.name);
          const key = `${source}:${peerId}`;
          incomingCalls.get(key)?.close();
          incomingCalls.set(key, call);
          call.answer();
          call.on("stream", (remoteStream) => {
            if (disposed) return;
            const setter = source === "camera" ? setRemoteCameras : setRemoteScreens;
            setter((current) => ({ ...current, [peerId]: remoteStream }));
            mediaRetryCounts.delete(key);
            setRoomError("");
            if (source === "screen") setActiveMediaId(`${peerId}-screen`);
            remoteStream.getVideoTracks()[0]?.addEventListener("ended", () => removeRemoteMedia(peerId, source));
          });
          call.on("close", () => {
            if (incomingCalls.get(key) !== call) return;
            incomingCalls.delete(key);
            removeRemoteMedia(peerId, source);
          });
          call.on("error", () => {
            if (incomingCalls.get(key) !== call) return;
            incomingCalls.delete(key);
            removeRemoteMedia(peerId, source);
          });
        };

        const attachPeer = (peer: PeerClient, allowDefaultFallback: boolean) => {
          localPeer = peer;
          peerRef.current = peer;
          peer.on("open", (id) => {
            if (disposed) return;
            selfPeerIdRef.current = id;
            const hostId = requestedHost || defaultRoomPeerId;
            hostPeerIdRef.current = hostId;
            const inviteParams = new URLSearchParams(window.location.search);
            inviteParams.delete("v");
            inviteParams.set("host", hostId);
            const stableInviteUrl = `${window.location.origin}${window.location.pathname}?${inviteParams.toString()}`;
            setInviteUrl(stableInviteUrl);
            if (!requestedHost && hostId === id) window.history.replaceState(null, "", `${window.location.pathname}?${inviteParams.toString()}`);
            setRoomStatus("ready");
            if (hostId !== id) connectToPeer(hostId);
          });
          peer.on("connection", bindConnection);
          peer.on("call", handleCall);
          peer.on("error", (error) => {
            if (error.type === "unavailable-id" && allowDefaultFallback && !disposed) {
              peer.destroy();
              attachPeer(new Peer(peerOptions), false);
              return;
            }
            if (error.type === "peer-unavailable") {
              setRoomError("房主暂时不在线，请让房主打开网站后重新复制房间链接。");
              return;
            }
            if (error.type === "webrtc") {
              setRoomError("画面连接正在重试，请稍候。");
              return;
            }
            setRoomStatus("error");
            setRoomError("实时房间连接失败，请检查代理网络后刷新页面。");
          });
        };

        attachPeer(
          requestedHost ? new Peer(peerOptions) : new Peer(defaultRoomPeerId, peerOptions),
          !requestedHost,
        );
      } catch {
        setRoomStatus("error");
        setRoomError("实时房间组件加载失败，请刷新页面重试。");
      }
    };

    void initializeRoom();

    return () => {
      disposed = true;
      callPeerRef.current = () => undefined;
      connections.forEach((connection) => connection.close());
      outgoingCalls.forEach((call) => call.close());
      incomingCalls.forEach((call) => call.close());
      connections.clear();
      outgoingCalls.clear();
      incomingCalls.clear();
      localPeer?.destroy();
      peerRef.current = null;
    };
  }, [joined]);

  useEffect(() => {
    cameraStreamRef.current = cameraStream;
    outgoingCallsRef.current.forEach((call, key) => {
      if (!key.startsWith("camera:")) return;
      call.close();
      outgoingCallsRef.current.delete(key);
    });
    if (cameraStream) {
      roomMembers.forEach((peerId) => callPeerRef.current(peerId, cameraStream, "camera"));
    }
  }, [cameraStream, roomMembers]);

  useEffect(() => {
    screenStreamRef.current = stream;
    outgoingCallsRef.current.forEach((call, key) => {
      if (!key.startsWith("screen:")) return;
      call.close();
      outgoingCallsRef.current.delete(key);
    });
    if (stream) {
      roomMembers.forEach((peerId) => callPeerRef.current(peerId, stream, "screen"));
    }
  }, [stream, roomMembers]);

  const addTask = async () => {
    const title = draft.trim();
    if (!title) return;

    if (connected && selectedProject) {
      const response = await fetch("/api/ticktick/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, projectId: selectedProject, dueDate: taskDueDate }),
      });
      if (response.ok) {
        setDraft("");
        await loadTasks();
        return;
      }
      setSyncError("任务没有写入滴答清单，请重试");
      return;
    }

    setTasks((current) => [...current, {
      id: String(Date.now()), title, project: "本次自习", done: false, source: "local",
    }]);
    setDraft("");
  };

  const toggleTask = async (task: Task) => {
    if (task.done) return;
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, done: true } : item));
    if (task.source === "ticktick" && task.projectId) {
      try {
        const response = await fetch("/api/ticktick/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: task.projectId, taskId: task.id }),
        });
        if (!response.ok) throw new Error("complete failed");
      } catch {
        setTasks((current) => current.map((item) => item.id === task.id ? { ...item, done: false } : item));
        setSyncError("完成状态没有同步成功");
      }
    }
  };

  const connectTickTick = async (event: FormEvent) => {
    event.preventDefault();
    setSyncError("");
    const response = await fetch("/api/ticktick/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token.trim() }),
    });
    if (!response.ok) {
      setSyncError("Token 无效或滴答接口暂时不可用");
      return;
    }
    setToken("");
    setSyncOpen(false);
    await loadTasks();
  };

  const disconnectTickTick = async () => {
    await fetch("/api/ticktick/token", { method: "DELETE" });
    setConnected(false);
    setProjects([]);
    setTasks((current) => current.filter((task) => task.source === "local"));
    setSyncOpen(false);
  };

  const startShare = async () => {
    setShareError("");
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setShareError("当前浏览器不支持屏幕共享，请使用最新版 Chrome、Edge 或 Safari。");
      return;
    }
    try {
      const detailMode = shareMode === "detail";
      const nextStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: detailMode ? 2560 : 1920 },
          height: { ideal: detailMode ? 1440 : 1080 },
          frameRate: { ideal: detailMode ? 15 : 30, max: detailMode ? 20 : 60 },
        },
        audio: false,
      });
      const track = nextStream.getVideoTracks()[0];
      if (track) {
        track.contentHint = detailMode ? "detail" : "motion";
        track.addEventListener("ended", () => { void roomRef.current?.localParticipant.unpublishTrack(track); setStream(null); });
        await roomRef.current?.localParticipant.publishTrack(track, { source: Track.Source.ScreenShare });
      }
      stream?.getTracks().forEach((item) => item.stop());
      setStream(nextStream);
      setActiveMediaId("self-screen");
    } catch (error) {
      if ((error as DOMException).name !== "NotAllowedError") setShareError("没有成功开始共享，请重新选择窗口或屏幕。");
    }
  };

  const stopShare = () => {
    stream?.getTracks().forEach((track) => { void roomRef.current?.localParticipant.unpublishTrack(track); track.stop(); });
    setStream(null);
  };

  const stopCamera = () => {
    cameraStream?.getTracks().forEach((track) => { void roomRef.current?.localParticipant.unpublishTrack(track); track.stop(); });
    setCameraStream(null);
  };

  const toggleCamera = async () => {
    if (cameraStream) {
      stopCamera();
      return;
    }

    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("当前浏览器不支持摄像头访问，请使用最新版 Chrome、Edge 或 Safari。");
      return;
    }

    try {
      const nextCameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 24, max: 30 },
          facingMode: "user",
        },
        audio: false,
      });
      const track = nextCameraStream.getVideoTracks()[0];
      track?.addEventListener("ended", () => { if (track) void roomRef.current?.localParticipant.unpublishTrack(track); setCameraStream(null); });
      if (track) await roomRef.current?.localParticipant.publishTrack(track, { source: Track.Source.Camera });
      setCameraStream(nextCameraStream);
      setActiveMediaId("self-camera");
    } catch (error) {
      const name = (error as DOMException).name;
      setCameraError(name === "NotAllowedError"
        ? "摄像头权限未开启，请在浏览器地址栏允许 11scat 使用摄像头。"
        : "摄像头暂时无法开启，请确认没有被其他程序占用。");
    }
  };

  const copyInviteLink = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setInviteCopied(true);
      window.setTimeout(() => setInviteCopied(false), 2200);
    } catch {
      window.prompt("复制这个邀请链接发给成员", inviteUrl);
    }
  };

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    const body = chatDraft.trim();
    if (!body) return;
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      body,
      time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
      sender: displayName,
      own: true,
    };
    setMessages((current) => [...current, message]);
    void roomRef.current?.localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify({ ...message, type: "chat" })),
      { reliable: true },
    );
    dataConnectionsRef.current.forEach((connection) => {
      if (connection.open) connection.send({ ...message, type: "chat", sender: displayNameRef.current || displayName });
    });
    setChatDraft("");
  };

  const completed = tasks.filter((task) => task.done).length;
  const visibleRemoteMembers = roomMembers.slice(0, 1);
  const emptyMemberSlots = Math.max(0, 1 - visibleRemoteMembers.length);
  const mediaItems: MediaItem[] = [];
  if (stream) mediaItems.push({ id: "self-screen", label: "你的屏幕", stream, kind: "screen", remote: false });
  if (cameraStream) mediaItems.push({ id: "self-camera", label: "你的摄像头", stream: cameraStream, kind: "camera", remote: false });
  visibleRemoteMembers.forEach((peerId) => {
    const memberName = memberNames[peerId] || peerId;
    if (remoteScreens[peerId]) mediaItems.push({ id: `${peerId}-screen`, label: `${memberName} 的屏幕`, stream: remoteScreens[peerId], kind: "screen", remote: true });
    if (remoteCameras[peerId]) mediaItems.push({ id: `${peerId}-camera`, label: `${memberName} 的摄像头`, stream: remoteCameras[peerId], kind: "camera", remote: true });
  });
  mediaItems.sort((left, right) => Number(right.kind === "screen") - Number(left.kind === "screen"));
  const mediaIds = mediaItems.map((item) => item.id).join("|");
  const activeMedia = mediaItems.find((item) => item.id === activeMediaId) || mediaItems[0];

  useEffect(() => {
    if (!mediaItems.length) {
      if (activeMediaId) setActiveMediaId("");
      return;
    }
    if (!mediaItems.some((item) => item.id === activeMediaId)) setActiveMediaId(mediaItems[0].id);
  }, [activeMediaId, mediaIds]);

  const stepMedia = (direction: -1 | 1) => {
    if (mediaItems.length < 2) return;
    const currentIndex = Math.max(0, mediaItems.findIndex((item) => item.id === activeMedia?.id));
    const nextIndex = (currentIndex + direction + mediaItems.length) % mediaItems.length;
    setActiveMediaId(mediaItems[nextIndex].id);
  };

  return (
    <main className="app-shell" id="top">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="11scat 首页">
          <span className="brand-mark">11</span><span>11scat</span>
        </a>
        <div className="session-status"><span className="pulse" />私人自习室 · 正在专注</div>
      </header>

      <section className="workspace">
        <aside className="task-panel panel">
          <div className="left-tabs" aria-label="左侧导航">
            <button className={leftView === "tasks" ? "active" : ""} onClick={() => setLeftView("tasks")}>待办事项</button>
            <button className={leftView === "members" ? "active" : ""} onClick={() => setLeftView("members")}>成员</button>
          </div>
          {leftView === "members" ? <div className="left-members">
            <div className="left-member"><span className="member-avatar">{(displayName || "你").slice(0, 1)}</span><div><strong>{displayName || "你"}</strong><small>正在专注 · {completed}/{tasks.length} 完成</small></div><span className="online-dot" /></div>
            {roomMembers.map((memberId) => (
              <div className="left-member" key={memberId}>
                <span className="member-avatar">{(memberNames[memberId] || memberId).slice(0, 1)}</span>
                <div><strong>{memberNames[memberId] || memberId}</strong><small>已加入房间</small></div>
                <span className="online-dot" />
              </div>
            ))}
            <div className="left-member muted"><span className="member-avatar invite">＋</span><div><strong>邀请成员</strong><small>加入后可选择共享任务进度</small></div></div>
          </div> : <>
          <div className="panel-heading">
            <div><span className="eyebrow">滴答清单</span><h1>最近7天</h1></div>
            <button className="sync-button" onClick={() => setSyncOpen(true)}>
              <span className={connected ? "sync-dot active" : "sync-dot"} />
              {syncing ? "读取中" : connected ? "滴答已连接" : "连接滴答"}
            </button>
          </div>

          <div className="progress-block">
            <div className="progress-copy"><span>{completed}/{tasks.length} 已完成</span><strong>{tasks.length ? Math.round((completed / tasks.length) * 100) : 0}%</strong></div>
            <div className="progress-track"><span style={{ width: `${tasks.length ? (completed / tasks.length) * 100 : 0}%` }} /></div>
          </div>

          {syncError && <p className="error-message" role="alert">{syncError}</p>}
          {!syncing && tasks.length === 0 && (
            <div className="empty-tasks">
              <strong>{connected ? "最近7天没有待办" : "还没有连接滴答清单"}</strong>
              <span>{connected ? "这里只显示有截止日期、已逾期或未来7天内到期的任务" : "连接后会跨清单读取滴答的最近7天任务"}</span>
            </div>
          )}

          <div className="task-list" aria-live="polite">
            {tasks.map((task) => (
              <label className={task.done ? "task-row done" : "task-row"} key={`${task.source}-${task.id}`}>
                <input type="checkbox" checked={task.done} onChange={() => void toggleTask(task)} disabled={task.done} />
                <span className="custom-check">✓</span>
                <span className="task-copy"><strong>{task.title}</strong><small>{task.source === "ticktick" ? "最近7天" : "站内任务"}{task.dueDate ? ` · ${formatDueDate(task.dueDate)}` : ""}</small></span>
              </label>
            ))}
          </div>

          <div className="add-task">
            <span>＋</span>
            <input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void addTask()} placeholder={connected ? "添加到滴答清单" : "添加本次自习任务"} />
            <button onClick={() => void addTask()}>添加</button>
          </div>
          {connected && selectedProject && (
            <div className="project-picker recent-picker"><span>最近7天</span><DatePicker value={taskDueDate} onChange={setTaskDueDate} /></div>
          )}
          </>}
        </aside>

        <section className="focus-stage panel">
          <div className="participant-strip">
            <button
              className="participant-tile active selectable"
              type="button"
              onClick={() => setActiveMediaId(stream ? "self-screen" : cameraStream ? "self-camera" : "")}
              aria-label="查看你的共享画面"
            >
              <span className="tile-badge">你</span>
              {cameraStream
                ? <MediaVideo className="camera-preview" stream={cameraStream} label="你的摄像头预览" />
                : <div className="tile-preview">{stream ? "屏幕共享中 · 摄像头关闭" : "摄像头关闭"}</div>}
              <small>{displayName || "你"}</small>
            </button>
            {visibleRemoteMembers.map((peerId, index) => (
              <button
                className="participant-tile connected selectable"
                type="button"
                key={peerId}
                onClick={() => setActiveMediaId(remoteScreens[peerId] ? `${peerId}-screen` : remoteCameras[peerId] ? `${peerId}-camera` : "")}
                aria-label={`查看 ${memberNames[peerId] || `成员 ${index + 1}`} 的共享画面`}
              >
                <span className="tile-badge">{(memberNames[peerId] || peerId).slice(0, 1)}</span>
                {remoteCameras[peerId]
                  ? <MediaVideo className="camera-preview remote" stream={remoteCameras[peerId]} label={`成员 ${index + 1} 的摄像头`} />
                  : <div className="tile-preview invite-preview">摄像头关闭</div>}
                <small>{memberNames[peerId] || peerId} · 已连接</small>
              </button>
            ))}
            {Array.from({ length: emptyMemberSlots }, (_, index) => (
              <button className="participant-tile participant-invite" type="button" onClick={() => void copyInviteLink()} key={`empty-${index}`}>
                <span className={index === 0 ? "tile-badge invite" : "tile-badge ghost"}>{index === 0 ? "＋" : "?"}</span>
                <span className="tile-preview invite-preview">{roomStatus === "connecting" ? "房间连接中" : inviteCopied ? "邀请链接已复制" : "邀请成员"}</span>
                <small>{roomStatus === "error" ? "连接异常" : "点击复制房间链接"}</small>
              </button>
            ))}
          </div>
          {roomError && <p className="room-error" role="alert">{roomError}</p>}
          <div className="share-canvas">
            {activeMedia ? <>
              <MediaVideo
                className={`main-media ${activeMedia.kind}${activeMedia.remote ? " remote" : ""}`}
                stream={activeMedia.stream}
                label={activeMedia.label}
              />
              {mediaItems.length > 1 && <>
                <button className="media-nav media-prev" type="button" onClick={() => stepMedia(-1)} aria-label="查看上一个画面">‹</button>
                <button className="media-nav media-next" type="button" onClick={() => stepMedia(1)} aria-label="查看下一个画面">›</button>
              </>}
              <div className="media-caption">{activeMedia.label}<span>{mediaItems.findIndex((item) => item.id === activeMedia.id) + 1} / {mediaItems.length}</span></div>
            </> : (
              <div className="empty-share">
                <div className="share-glyph"><span /><span /><span /></div>
                <h2>共享你的学习窗口</h2>
                <p>文字与代码模式优先保留细节，适合长时间自习和讲题。</p>
                <button className="primary-button" onClick={startShare}>开始高清共享</button>
                <span className="privacy-note">只会共享你主动选择的窗口或屏幕</span>
              </div>
            )}
          </div>
          {(shareError || cameraError) && <p className="error-message" role="alert">{shareError || cameraError}</p>}
          <div className="quality-bar">
            <div className="quality-copy"><span className="quality-icon">HD</span><div><strong>{shareMode === "detail" ? "文字 / 代码优先" : "动态画面优先"}</strong><small>{shareMode === "detail" ? "最高 1440p · 15 FPS · 细节增强" : "最高 1080p · 30 FPS · 动态流畅"}</small></div></div>
            <div className="segmented"><button className={shareMode === "detail" ? "active" : ""} onClick={() => setShareMode("detail")}>文字 / 代码</button><button className={shareMode === "motion" ? "active" : ""} onClick={() => setShareMode("motion")}>动态画面</button></div>
            {stream && <button className="stop-button" onClick={stopShare}>停止共享</button>}
          </div>
          <div className="room-controls"><button className={cameraStream ? "camera-on" : ""} onClick={() => void toggleCamera()} aria-label={cameraStream ? "关闭摄像头" : "开启摄像头"} title={cameraStream ? "关闭摄像头" : "开启摄像头"}>{cameraStream ? "●" : "◉"}</button><button aria-label="静音">♩</button><button className="room-stop" onClick={stopShare} aria-label="停止共享">■</button><button aria-label="更多设置">⋮</button><button className="room-leave" onClick={() => { stopShare(); stopCamera(); }}>退出房间</button></div>
        </section>

        <aside className="chat-panel panel">
          <div className="chat-heading"><div><span className="eyebrow">ROOM CHAT</span><h2>自习室聊天</h2></div><span className="local-badge">本机</span></div>
          <div className="side-tabs" aria-label="侧栏内容">
            <button className={sideView === "chat" ? "active" : ""} onClick={() => setSideView("chat")}>聊天</button>
            <button className={sideView === "members" ? "active" : ""} onClick={() => setSideView("members")}>成员任务</button>
          </div>
          {sideView === "chat" ? <>
            <div className="chat-notice">成员加入后，消息会在当前房间实时同步；重新加入房间时会收到房主保留的聊天记录。</div>
            <div className="message-list" aria-live="polite">
              {messages.length === 0 ? <div className="empty-chat"><strong>还没有消息</strong><span>可以先记录一句本轮目标或休息提醒。</span></div> : messages.map((message) => (
                <div className={message.own ? "message own" : "message"} key={message.id}><span>{message.sender} · {message.time}</span><p>{message.body}</p></div>
              ))}
            </div>
            <form className="chat-form" onSubmit={sendMessage}>
              <textarea
                value={chatDraft}
                onChange={(event) => setChatDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                aria-label="输入房间消息"
                rows={3}
              />
              <button className="primary-button" type="submit">发送</button>
            </form>
          </> : <div className="member-task-view">
            <div className="member-summary">
              <span className="member-avatar">你</span>
              <div><strong>你的任务进度</strong><small>{connected ? `${completed}/${tasks.length} 已完成 · 滴答已授权` : `${completed}/${tasks.length} 已完成 · 尚未连接滴答`}</small></div>
              <b>{tasks.length ? Math.round((completed / tasks.length) * 100) : 0}%</b>
            </div>
            <div className="member-empty">
              <span>＋</span><strong>等待其他成员加入</strong>
              <p>成员加入房间、连接自己的滴答清单并同意共享后，这里才会显示其任务名称或仅显示完成比例。</p>
            </div>
            <div className="privacy-card"><strong>隐私规则</strong><span>默认不公开清单；每位成员可选择“仅共享进度”或“共享任务名称”。</span></div>
          </div>}
        </aside>
      </section>

      {!joined && (
        <div className="modal-backdrop join-backdrop" role="presentation">
          <section className="join-modal" role="dialog" aria-modal="true" aria-labelledby="join-title">
            <span className="ticktick-mark">11</span>
            <span className="eyebrow">11SCAT STUDY ROOM</span>
            <h2 id="join-title">进入自习室</h2>
            <p>先设置一个房间内显示的称号。其他成员会用这个名称看到你。</p>
            <form onSubmit={(event) => {
              event.preventDefault();
              const name = displayName.trim();
              if (!name) return;
              setDisplayName(name.slice(0, 24));
              setJoined(true);
            }}>
              <label className="token-label">你的称号
                <input name="displayName" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={24} pattern=".*\S.*" title="请输入你的称号" required autoFocus />
              </label>
              <button className="primary-button wide" type="submit">进入房间</button>
            </form>
          </section>
        </div>
      )}

      {syncOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSyncOpen(false)}>
          <section className="sync-modal" role="dialog" aria-modal="true" aria-labelledby="sync-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setSyncOpen(false)} aria-label="关闭">×</button>
            <span className="ticktick-mark">✓</span><span className="eyebrow">REAL TICKTICK CONNECTION</span>
            <h2 id="sync-title">连接你的滴答清单</h2>
            <p>这里不再使用演示任务。Token 只会以加密、HttpOnly Cookie 保存在你的浏览器中，用于读取任务、添加任务和同步完成状态。</p>
            {connected ? (
              <div className="connected-actions"><button className="primary-button wide" onClick={() => { setSyncOpen(false); void loadTasks(); }}>立即刷新</button><button className="disconnect-button" onClick={() => void disconnectTickTick()}>断开滴答清单</button></div>
            ) : (
              <form onSubmit={connectTickTick}>
                <label className="token-label">滴答 API Token<input type="password" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" placeholder="粘贴 Token" required /></label>
                {syncError && <p className="error-message">{syncError}</p>}
                <button className="primary-button wide" type="submit">验证并连接</button>
              </form>
            )}
            <a className="oauth-link" href="https://dida365.com/webapp/#settings/account" target="_blank" rel="noreferrer">前往滴答网页端：头像 → 设置 → 账户与安全 → API 口令</a>
          </section>
        </div>
      )}
    </main>
  );
}
