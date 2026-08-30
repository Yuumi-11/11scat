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

type ChatMessage = { id: string; body: string; time: string; sender: string; own?: boolean };
type SharedTask = Pick<Task, "id" | "title" | "project" | "dueDate" | "done">;
type MediaSource = "camera" | "screen";
type MediaItem = {
  id: string;
  label: string;
  stream: MediaStream;
  kind: MediaSource;
  remote: boolean;
};

const USE_LIVEKIT = false;

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

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskView, setTaskView] = useState<"today" | "week">("today");
  const [shareMode, setShareMode] = useState<"detail" | "motion">("detail");
  const [shareModeOpen, setShareModeOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [shareError, setShareError] = useState("");
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [roomMembers, setRoomMembers] = useState<string[]>([]);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [displayName, setDisplayName] = useState("");
  const [joined, setJoined] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [joinError, setJoinError] = useState("");
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
  const [sideView, setSideView] = useState<"chat" | "tasks">("chat");
  const [memberTasks, setMemberTasks] = useState<Record<string, SharedTask[]>>({});
  const [activity, setActivity] = useState("");
  const [memberActivities, setMemberActivities] = useState<Record<string, string>>({});
  const roomRef = useRef<Room | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<PeerClient | null>(null);
  const selfPeerIdRef = useRef("");
  const hostPeerIdRef = useRef("");
  const dataConnectionsRef = useRef(new Map<string, DataConnection>());
  const messagesRef = useRef<ChatMessage[]>([]);
  const tasksRef = useRef<Task[]>([]);
  const activityRef = useRef("");
  const outgoingCallsRef = useRef(new Map<string, MediaConnection>());
  const incomingCallsRef = useRef(new Map<string, MediaConnection>());
  const callPeerRef = useRef<(peerId: string, media: MediaStream, source: MediaSource) => void>(() => undefined);
  const displayNameRef = useRef("");
  const memberNamesRef = useRef<Record<string, string>>({});

  const loadTasks = async () => {
    setSyncing(true);
    setSyncError("");
    try {
      const response = await fetch(`/api/ticktick/tasks?view=${taskView}`, { cache: "no-store" });
      if (response.status === 401) {
        setConnected(false);
        setTasks((current) => current.filter((task) => task.source === "local"));
        return false;
      }
      if (!response.ok) throw new Error("暂时无法读取滴答清单");
      const data = await response.json();
      if (!Array.isArray(data.tasks) || !Array.isArray(data.projects)) throw new Error("滴答返回的数据格式异常");
      const remoteTasks: Task[] = data.tasks.map((task: Task) => ({ ...task, source: "ticktick" }));
      setConnected(true);
      setTasks((current) => [...remoteTasks, ...current.filter((task) => task.source === "local")]);
      return true;
    } catch (error) {
      setConnected(false);
      setTasks((current) => current.filter((task) => task.source === "local"));
      setSyncError(error instanceof Error ? error.message : "同步失败");
      return false;
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => { void loadTasks(); }, [taskView]);

  useEffect(() => {
    let disposed = false;
    const loadProfile = async () => {
      try {
        const response = await fetch("/api/identity/me", { cache: "no-store" });
        if (!response.ok) throw new Error("profile unavailable");
        const data = await response.json() as { identityId?: unknown; nickname?: unknown };
        const nickname = typeof data.nickname === "string" ? data.nickname.trim().slice(0, 24) : "";
        const identityName = typeof data.identityId === "string" ? data.identityId.trim().slice(0, 24) : "";
        if (!disposed) {
          setDisplayName(nickname || identityName || "成员");
          setJoined(true);
        }
      } catch {
        if (!disposed) setJoinError("暂时无法读取身份资料，请刷新页面重试。");
      } finally {
        if (!disposed) setProfileReady(true);
      }
    };
    void loadProfile();
    return () => { disposed = true; };
  }, []);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { activityRef.current = activity.trim().slice(0, 80); }, [activity]);
  useEffect(() => {
    tasksRef.current = tasks;
    const shared = tasks.filter((task) => !task.done).slice(0, 50).map(({ id, title, project, dueDate, done }) => ({ id, title, project, dueDate, done }));
    void roomRef.current?.localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify({ type: "task-snapshot", tasks: shared })),
      { reliable: true },
    );
    dataConnectionsRef.current.forEach((connection) => {
      if (connection.open) connection.send({ type: "task-snapshot", tasks: shared });
    });
  }, [tasks]);
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
      setMemberTasks((current) => {
        if (!current[participant.identity]) return current;
        const next = { ...current };
        delete next[participant.identity];
        return next;
      });
      setMemberActivities((current) => {
        if (!(participant.identity in current)) return current;
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
        const message = JSON.parse(new TextDecoder().decode(payload)) as ChatMessage & { type?: string; tasks?: unknown; activity?: unknown };
        if (message.type === "activity" && participant && typeof message.activity === "string") {
          const nextActivity = message.activity.trim().slice(0, 80);
          setMemberActivities((current) => ({ ...current, [participant.identity]: nextActivity }));
          return;
        }
        if (message.type === "task-snapshot" && participant && Array.isArray(message.tasks)) {
          const incomingTasks = message.tasks.filter((item): item is SharedTask => Boolean(
            item && typeof item === "object" && typeof (item as SharedTask).id === "string" && typeof (item as SharedTask).title === "string",
          ));
          setMemberTasks((current) => ({ ...current, [participant.identity]: incomingTasks.slice(0, 50) }));
          return;
        }
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
    const peerDeviceIds = new Map<string, string>();
    let localDeviceId = "";

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
      peerDeviceIds.delete(peerId);
      closePeerCalls(peerId);
      setRoomStatus("ready");
      setRoomError("");
      window.setTimeout(() => {
        if (!disposed && localPeer?.open && connections.size === 0) {
          setRoomStatus("ready");
          setRoomError("");
        }
      }, 300);
      setMemberNames((current) => {
        if (!current[peerId]) return current;
        const next = { ...current };
        delete next[peerId];
        return next;
      });
      setMemberTasks((current) => {
        if (!current[peerId]) return current;
        const next = { ...current };
        delete next[peerId];
        return next;
      });
      setMemberActivities((current) => {
        if (!(peerId in current)) return current;
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
      bindConnection(localPeer.connect(peerId, {
        reliable: true,
        metadata: { room: hostPeerIdRef.current, name: displayNameRef.current, deviceId: localDeviceId },
      }));
    }

    function bindConnection(connection: DataConnection, incoming = false) {
      const peerId = connection.peer;

      const handleOpen = () => {
        if (disposed) return;
        const incomingDeviceId = incoming && typeof connection.metadata?.deviceId === "string"
          ? connection.metadata.deviceId.trim().slice(0, 80)
          : "";
        if (incomingDeviceId) {
          const replacedPeerId = Array.from(connections.keys()).find((candidate) => (
            candidate !== peerId && peerDeviceIds.get(candidate) === incomingDeviceId
          ));
          if (replacedPeerId) {
            const replacedConnection = connections.get(replacedPeerId);
            removePeer(replacedPeerId);
            replacedConnection?.close();
          }
        }
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
        if (incomingDeviceId) peerDeviceIds.set(peerId, incomingDeviceId);
        rememberPeerName(peerId, connection.metadata?.name);
        setRoomError("");
        refreshMembers();
        connection.send({ type: "presence", name: displayNameRef.current, deviceId: localDeviceId, activity: activityRef.current });
        connection.send({
          type: "task-snapshot",
          tasks: tasksRef.current.filter((task) => !task.done).slice(0, 50).map(({ id, title, project, dueDate, done }) => ({ id, title, project, dueDate, done })),
        });
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
        const message = payload as { type: string; ids?: unknown; messages?: unknown; tasks?: unknown; id?: unknown; body?: unknown; time?: unknown; sender?: unknown; name?: unknown; deviceId?: unknown; activity?: unknown };
        if (message.type === "presence") {
          rememberPeerName(peerId, message.name);
          if (typeof message.activity === "string") {
            const nextActivity = message.activity.trim().slice(0, 80);
            setMemberActivities((current) => ({ ...current, [peerId]: nextActivity }));
          }
          const deviceId = typeof message.deviceId === "string" ? message.deviceId.trim().slice(0, 80) : "";
          if (deviceId) peerDeviceIds.set(peerId, deviceId);
          return;
        }
        if (message.type === "activity" && typeof message.activity === "string") {
          const nextActivity = message.activity.trim().slice(0, 80);
          setMemberActivities((current) => ({ ...current, [peerId]: nextActivity }));
          return;
        }
        if (message.type === "media-request") {
          if (cameraStreamRef.current) callPeer(peerId, cameraStreamRef.current, "camera");
          if (screenStreamRef.current) callPeer(peerId, screenStreamRef.current, "screen");
          return;
        }
        if (message.type === "task-snapshot" && Array.isArray(message.tasks)) {
          const incomingTasks = message.tasks.filter((item): item is SharedTask => Boolean(
            item && typeof item === "object" && typeof (item as SharedTask).id === "string" && typeof (item as SharedTask).title === "string",
          ));
          setMemberTasks((current) => ({ ...current, [peerId]: incomingTasks.slice(0, 50) }));
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

        try {
          const deviceKey = "11scat-peer-device-id";
          localDeviceId = window.localStorage.getItem(deviceKey) || crypto.randomUUID();
          window.localStorage.setItem(deviceKey, localDeviceId);
        } catch {
          localDeviceId = crypto.randomUUID();
        }

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

        const attachPeer = (peer: PeerClient, allowGuestFallback: boolean) => {
          localPeer = peer;
          peerRef.current = peer;
          peer.on("open", (id) => {
            if (disposed) return;
            selfPeerIdRef.current = id;
            const hostId = defaultRoomPeerId;
            hostPeerIdRef.current = hostId;
            const stableInviteUrl = `${window.location.origin}${window.location.pathname}`;
            setInviteUrl(stableInviteUrl);
            if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
            setRoomStatus("ready");
            if (hostId !== id) connectToPeer(hostId);
          });
          peer.on("connection", (connection) => bindConnection(connection, true));
          peer.on("call", handleCall);
          peer.on("error", (error) => {
            if (error.type === "unavailable-id" && allowGuestFallback && !disposed) {
              peer.destroy();
              attachPeer(new Peer(peerOptions), false);
              return;
            }
            if (error.type === "peer-unavailable") {
              setRoomError("房间正在重新连接，请稍候或刷新页面。");
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

        attachPeer(new Peer(defaultRoomPeerId, peerOptions), true);
      } catch {
        setRoomStatus("error");
        setRoomError("实时房间组件加载失败，请刷新页面重试。");
      }
    };

    const leaveOnPageHide = () => localPeer?.destroy();
    window.addEventListener("pagehide", leaveOnPageHide);
    void initializeRoom();

    return () => {
      disposed = true;
      window.removeEventListener("pagehide", leaveOnPageHide);
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
    const loaded = await loadTasks();
    if (loaded) setSyncOpen(false);
  };

  const disconnectTickTick = async () => {
    await fetch("/api/ticktick/token", { method: "DELETE" });
    setConnected(false);
    setTasks((current) => current.filter((task) => task.source === "local"));
    setSyncOpen(false);
  };

  const startShare = async (mode: "detail" | "motion") => {
    setShareError("");
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setShareError("当前浏览器不支持屏幕共享，请使用最新版 Chrome、Edge 或 Safari。");
      return;
    }
    try {
      const detailMode = mode === "detail";
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
      setShareMode(mode);
      setActiveMediaId("self-screen");
    } catch (error) {
      if ((error as DOMException).name !== "NotAllowedError") setShareError("没有成功开始共享，请重新选择窗口或屏幕。");
    }
  };

  const chooseShareMode = async (mode: "detail" | "motion") => {
    setShareMode(mode);
    setShareModeOpen(false);
    const track = stream?.getVideoTracks()[0];
    if (!track) {
      await startShare(mode);
      return;
    }
    const detailMode = mode === "detail";
    track.contentHint = detailMode ? "detail" : "motion";
    try {
      await track.applyConstraints({
        width: { ideal: detailMode ? 2560 : 1920 },
        height: { ideal: detailMode ? 1440 : 1080 },
        frameRate: { ideal: detailMode ? 15 : 30, max: detailMode ? 20 : 60 },
      });
    } catch {
      setShareError("共享模式已切换，但当前浏览器保留了原始画面参数。");
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

  const submitActivity = (event: FormEvent) => {
    event.preventDefault();
    const nextActivity = activity.trim().slice(0, 80);
    setActivity(nextActivity);
    void roomRef.current?.localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify({ type: "activity", activity: nextActivity })),
      { reliable: true },
    );
    dataConnectionsRef.current.forEach((connection) => {
      if (connection.open) connection.send({ type: "activity", activity: nextActivity });
    });
    (event.currentTarget.querySelector("input") as HTMLInputElement | null)?.blur();
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

  const visibleTasks = tasks.filter((task) => !task.done);
  const visibleRemoteMembers = roomMembers.slice(0, 1);
  const taskBoardMembers = visibleRemoteMembers.filter((memberId) => Boolean(memberNames[memberId]));
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
        <div className="session-status"><span className="pulse" />一一主人专属</div>
      </header>

      <section className="workspace">
        <section className="focus-stage panel">
          <div className="participant-strip">
            <button
              className="participant-tile active selectable"
              type="button"
              onClick={() => setActiveMediaId(stream ? "self-screen" : cameraStream ? "self-camera" : "")}
              aria-label="查看你的共享画面"
            >
              <span className="tile-badge">你</span>
              {stream
                ? <MediaVideo className="tile-preview-media" stream={stream} label="你的屏幕预览" />
                : cameraStream
                  ? <MediaVideo className="camera-preview" stream={cameraStream} label="你的摄像头预览" />
                  : <div className="tile-preview" aria-hidden="true" />}
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
                {remoteScreens[peerId]
                  ? <MediaVideo className="tile-preview-media" stream={remoteScreens[peerId]} label={`成员 ${index + 1} 的屏幕预览`} />
                  : remoteCameras[peerId]
                    ? <MediaVideo className="camera-preview remote" stream={remoteCameras[peerId]} label={`成员 ${index + 1} 的摄像头`} />
                    : <div className="tile-preview invite-preview" aria-hidden="true" />}
                <small>{memberNames[peerId] || peerId}</small>
              </button>
            ))}
            {Array.from({ length: emptyMemberSlots }, (_, index) => (
              <button className="participant-tile participant-invite" type="button" onClick={() => void copyInviteLink()} key={`empty-${index}`}>
                <span className="tile-badge invite">＋</span>
                <span className="tile-preview invite-preview" aria-hidden="true" />
                <small>{roomStatus === "error" ? "连接异常" : inviteCopied ? "邀请链接已复制" : "点击复制邀请链接"}</small>
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
              {stream && <button className="share-mode-switch" type="button" onClick={() => setShareModeOpen(true)} title="切换共享画面模式">{shareMode === "detail" ? "文字 / 代码" : "动态画面"}</button>}
            </> : (
              <div className="empty-share">
                <div className="share-glyph"><span /><span /><span /></div>
                <button className="primary-button" onClick={() => setShareModeOpen(true)}>开始共享</button>
              </div>
            )}
          </div>
          {(shareError || cameraError) && <p className="error-message" role="alert">{shareError || cameraError}</p>}
          <div className="room-controls">
            <button className={cameraStream ? "camera-on" : ""} onClick={() => void toggleCamera()} aria-label="开启摄像头" data-tooltip="开启摄像头">◉</button>
            <button aria-label="麦克风" data-tooltip="麦克风">
              <svg className="room-control-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 9.5V6a3 3 0 0 1 6 0v5.5a3 3 0 0 1-.35 1.41" />
                <path d="M5.5 10.5v1a6.5 6.5 0 0 0 10.64 5.01M18.5 10.5v1a6.47 6.47 0 0 1-.71 2.95M12 18v3M9 21h6M4 4l16 16" />
              </svg>
            </button>
            <button className="room-stop" onClick={stopShare} aria-label="结束共享" data-tooltip="结束共享">
              <svg className="room-control-icon room-stop-icon" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="7" y="7" width="10" height="10" rx=".5" />
              </svg>
            </button>
            <button aria-label="更多" data-tooltip="更多">⋮</button>
            <button className="room-leave" onClick={() => { stopShare(); stopCamera(); window.location.assign("/access"); }}>退出房间</button>
          </div>
        </section>

        <aside className="side-panel panel">
          <div className="side-tabs" aria-label="侧栏内容">
            <button className={sideView === "chat" ? "active" : ""} onClick={() => setSideView("chat")}>聊天室</button>
            <button className={sideView === "tasks" ? "active" : ""} onClick={() => setSideView("tasks")}>任务板</button>
          </div>

          {sideView === "chat" ? <div className="chat-view">
            <div className="chat-heading"><div><span className="eyebrow">ROOM CHAT</span><h2>自习室聊天</h2></div></div>
            <div className="message-list" aria-live="polite">
              {messages.length === 0 ? <div className="empty-chat"><strong>还没有消息</strong></div> : messages.map((message) => (
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
                rows={2}
              />
              <button className="primary-button" type="submit">发送</button>
            </form>
          </div> : <div className="task-view">
            <button
              className="task-range-switch"
              type="button"
              onClick={() => setTaskView((current) => current === "today" ? "week" : "today")}
              aria-label={`当前显示${taskView === "today" ? "今天" : "最近 7 天"}，点击切换到${taskView === "today" ? "最近 7 天" : "今天"}`}
            >
              <span aria-hidden="true">▦</span>{taskView === "today" ? "今天" : "最近 7 天"}
            </button>
            {syncError && <p className="error-message" role="alert">{syncError}</p>}

            <div className="task-scroll">
              <section className="task-person-card self-task-card" aria-label="我的任务">
                <form className="activity-box" onSubmit={submitActivity}>
                  <label htmlFor="activity-input">我正在</label>
                  <input id="activity-input" value={activity} onChange={(event) => setActivity(event.target.value)} maxLength={80} placeholder="..." aria-label="填写你正在进行的事情，按 Enter 同步" />
                </form>
                <div className="task-person-list">
                  {!syncing && !connected ? (
                    <div className="ticktick-connect-empty"><button className="primary-button" type="button" onClick={() => setSyncOpen(true)}>连接滴答</button></div>
                  ) : (
                    <div className="task-list" aria-live="polite">
                      {visibleTasks.map((task) => (
                      <label className="task-row" key={task.id}>
                        <input type="checkbox" checked={false} onChange={() => void toggleTask(task)} />
                        <span className="custom-check">✓</span>
                        <span className="task-copy"><strong>{task.title}</strong><small>{task.project}{task.dueDate ? ` · ${formatDueDate(task.dueDate)}` : ""}</small></span>
                      </label>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              {taskBoardMembers.map((memberId) => {
                const nickname = memberNames[memberId];
                const sharedTasks = memberTasks[memberId] || [];
                const memberActivity = memberActivities[memberId] || "...";
                return (
                  <section className="task-person-card" aria-label={`${nickname}的任务`} key={memberId}>
                    <div className="activity-box readonly"><strong>{nickname}正在</strong><span className={memberActivity === "..." ? "empty-activity" : ""}>{memberActivity}</span></div>
                    <div className="task-person-list">
                      <div className="task-list">
                        {sharedTasks.map((task) => (
                      <div className="task-row readonly-task" key={task.id}>
                        <span className="custom-check" />
                        <span className="task-copy"><strong>{task.title}</strong><small>{task.project}{task.dueDate ? ` · ${formatDueDate(task.dueDate)}` : ""}</small></span>
                      </div>
                        ))}
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
          </div>}
        </aside>
      </section>

      {profileReady && !joined && <p className="error-message" role="alert">{joinError || "正在进入自习室…"}</p>}

      {shareModeOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShareModeOpen(false)}>
          <section className="share-mode-modal" role="dialog" aria-modal="true" aria-labelledby="share-mode-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setShareModeOpen(false)} aria-label="关闭">×</button>
            <h2 id="share-mode-title">选择共享模式</h2>
            <div className="share-mode-options">
              <button type="button" onClick={() => void chooseShareMode("detail")}>
                <strong>文字 / 代码</strong>
                <span>字迹清晰，适合阅读和讲题</span>
              </button>
              <button type="button" onClick={() => void chooseShareMode("motion")}>
                <strong>动态画面</strong>
                <span>帧率更高，适合视频和演示</span>
              </button>
            </div>
          </section>
        </div>
      )}

      {syncOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSyncOpen(false)}>
          <section className="sync-modal" role="dialog" aria-modal="true" aria-labelledby="sync-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setSyncOpen(false)} aria-label="关闭">×</button>
            <span className="ticktick-mark">✓</span><span className="eyebrow">REAL TICKTICK CONNECTION</span>
            <h2 id="sync-title">连接你的滴答清单</h2>
            <p>Token 会按身份加密保存在服务器中，用于读取任务和同步完成状态。以后使用同一身份识别码时会自动恢复。</p>
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
