"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { DataConnection, MediaConnection, Peer as PeerClient } from "peerjs";

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
type ChatMessage = { id: number; body: string; time: string };

const pad = (value: number) => String(value).padStart(2, "0");

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

function RemoteCamera({ stream, label }: { stream: MediaStream; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);

  return <video className="camera-preview remote" ref={ref} autoPlay playsInline aria-label={label} />;
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [draft, setDraft] = useState("");
  const [seconds, setSeconds] = useState(50 * 60);
  const [running, setRunning] = useState(false);
  const [shareMode, setShareMode] = useState<"detail" | "motion">("detail");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [shareError, setShareError] = useState("");
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [roomMembers, setRoomMembers] = useState<string[]>([]);
  const [remoteCameras, setRemoteCameras] = useState<Record<string, MediaStream>>({});
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<PeerClient | null>(null);
  const selfPeerIdRef = useRef("");
  const hostPeerIdRef = useRef("");
  const dataConnectionsRef = useRef(new Map<string, DataConnection>());
  const outgoingCallsRef = useRef(new Map<string, MediaConnection>());
  const incomingCallsRef = useRef(new Map<string, MediaConnection>());
  const callPeerRef = useRef<(peerId: string, media: MediaStream) => void>(() => undefined);

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
      setSelectedProject((current) => current || data.projects[0]?.id || "");
      setTasks((current) => [...remoteTasks, ...current.filter((task) => task.source === "local")]);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "同步失败");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => { void loadTasks(); }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("11scat-chat");
    if (saved) {
      try { setMessages(JSON.parse(saved)); } catch { /* ignore malformed local data */ }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("11scat-chat", JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (!running || seconds <= 0) return;
    const timer = window.setInterval(() => setSeconds((value) => value - 1), 1000);
    return () => window.clearInterval(timer);
  }, [running, seconds]);

  useEffect(() => { if (seconds === 0) setRunning(false); }, [seconds]);
  useEffect(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, [stream]);
  useEffect(() => { if (cameraVideoRef.current) cameraVideoRef.current.srcObject = cameraStream; }, [cameraStream]);
  useEffect(() => () => stream?.getTracks().forEach((track) => track.stop()), [stream]);
  useEffect(() => () => cameraStream?.getTracks().forEach((track) => track.stop()), [cameraStream]);

  useEffect(() => {
    let disposed = false;
    let localPeer: PeerClient | null = null;
    const connections = dataConnectionsRef.current;
    const outgoingCalls = outgoingCallsRef.current;
    const incomingCalls = incomingCallsRef.current;

    const refreshMembers = () => {
      setRoomMembers(Array.from(connections.keys()));
    };

    const removeRemoteCamera = (peerId: string) => {
      setRemoteCameras((current) => {
        if (!current[peerId]) return current;
        const next = { ...current };
        delete next[peerId];
        return next;
      });
    };

    const removePeer = (peerId: string) => {
      connections.delete(peerId);
      outgoingCalls.get(peerId)?.close();
      incomingCalls.get(peerId)?.close();
      outgoingCalls.delete(peerId);
      incomingCalls.delete(peerId);
      removeRemoteCamera(peerId);
      refreshMembers();
    };

    const callPeer = (peerId: string, media: MediaStream) => {
      if (!localPeer?.open || !connections.get(peerId)?.open) return;
      const existing = outgoingCalls.get(peerId);
      if (existing?.open) return;
      existing?.close();

      const call = localPeer.call(peerId, media, { metadata: { source: "camera" } });
      outgoingCalls.set(peerId, call);
      call.on("close", () => {
        if (outgoingCalls.get(peerId) === call) outgoingCalls.delete(peerId);
      });
      call.on("error", () => {
        if (outgoingCalls.get(peerId) === call) outgoingCalls.delete(peerId);
      });
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
      if (!localPeer?.open || !peerId || peerId === selfId || connections.has(peerId)) return;
      bindConnection(localPeer.connect(peerId, { reliable: true, metadata: { room: hostPeerIdRef.current } }));
    }

    function bindConnection(connection: DataConnection) {
      const peerId = connection.peer;

      const handleOpen = () => {
        if (disposed) return;
        const existing = connections.get(peerId);
        if (existing && existing !== connection && existing.open) {
          connection.close();
          return;
        }

        connections.set(peerId, connection);
        setRoomError("");
        refreshMembers();
        if (hostPeerIdRef.current === selfPeerIdRef.current) broadcastPeerList();
        if (cameraStreamRef.current) callPeer(peerId, cameraStreamRef.current);
      };

      connection.on("open", handleOpen);
      connection.on("data", (payload) => {
        if (!payload || typeof payload !== "object" || !("type" in payload)) return;
        const message = payload as { type: string; ids?: unknown };
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

        const requestedHost = new URL(window.location.href).searchParams.get("host") || "";
        localPeer = new Peer({ debug: 1 });
        peerRef.current = localPeer;

        localPeer.on("open", (id) => {
          if (disposed) return;
          selfPeerIdRef.current = id;
          const hostId = requestedHost || id;
          hostPeerIdRef.current = hostId;
          setInviteUrl(`${window.location.origin}${window.location.pathname}?host=${encodeURIComponent(hostId)}`);
          setRoomStatus("ready");
          if (requestedHost && requestedHost !== id) connectToPeer(requestedHost);
        });

        localPeer.on("connection", bindConnection);
        localPeer.on("call", (call) => {
          const peerId = call.peer;
          incomingCalls.get(peerId)?.close();
          incomingCalls.set(peerId, call);
          call.answer();
          call.on("stream", (remoteStream) => {
            if (disposed) return;
            setRemoteCameras((current) => ({ ...current, [peerId]: remoteStream }));
            remoteStream.getVideoTracks()[0]?.addEventListener("ended", () => removeRemoteCamera(peerId));
          });
          call.on("close", () => {
            if (incomingCalls.get(peerId) !== call) return;
            incomingCalls.delete(peerId);
            removeRemoteCamera(peerId);
          });
          call.on("error", () => {
            if (incomingCalls.get(peerId) !== call) return;
            incomingCalls.delete(peerId);
            removeRemoteCamera(peerId);
          });
        });

        localPeer.on("error", (error) => {
          if (error.type === "peer-unavailable") {
            setRoomError("邀请链接对应的房主暂时不在线，请让房主重新复制链接。");
            return;
          }
          setRoomStatus("error");
          setRoomError("实时房间连接失败，请检查代理网络后刷新页面。");
        });
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
  }, []);

  useEffect(() => {
    cameraStreamRef.current = cameraStream;
    if (cameraStream) {
      roomMembers.forEach((peerId) => callPeerRef.current(peerId, cameraStream));
      return;
    }

    outgoingCallsRef.current.forEach((call) => call.close());
    outgoingCallsRef.current.clear();
  }, [cameraStream, roomMembers]);

  const addTask = async () => {
    const title = draft.trim();
    if (!title) return;

    if (connected && selectedProject) {
      const response = await fetch("/api/ticktick/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, projectId: selectedProject }),
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
    if (task.source === "ticktick" && task.projectId) {
      const response = await fetch("/api/ticktick/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: task.projectId, taskId: task.id }),
      });
      if (!response.ok) {
        setSyncError("完成状态没有同步成功");
        return;
      }
    }
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, done: true } : item));
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
        track.addEventListener("ended", () => setStream(null));
      }
      stream?.getTracks().forEach((item) => item.stop());
      setStream(nextStream);
    } catch (error) {
      if ((error as DOMException).name !== "NotAllowedError") setShareError("没有成功开始共享，请重新选择窗口或屏幕。");
    }
  };

  const stopShare = () => {
    stream?.getTracks().forEach((track) => track.stop());
    setStream(null);
  };

  const stopCamera = () => {
    cameraStream?.getTracks().forEach((track) => track.stop());
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
      track?.addEventListener("ended", () => setCameraStream(null));
      setCameraStream(nextCameraStream);
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
    setMessages((current) => [...current, {
      id: Date.now(), body, time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
    }]);
    setChatDraft("");
  };

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  const completed = tasks.filter((task) => task.done).length;
  const visibleRemoteMembers = roomMembers.slice(0, 2);
  const emptyMemberSlots = Math.max(0, 2 - visibleRemoteMembers.length);

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
            <div className="left-member"><span className="member-avatar">你</span><div><strong>你</strong><small>正在专注 · {completed}/{tasks.length} 完成</small></div><span className="online-dot" /></div>
            <div className="left-member muted"><span className="member-avatar invite">＋</span><div><strong>邀请同学</strong><small>加入后可选择共享任务进度</small></div></div>
            <button className="primary-button invite-button" onClick={() => setSideView("members")}>查看共享规则</button>
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
                <span className="task-copy"><strong>{task.title}</strong><small>{task.source === "ticktick" ? task.project : "站内任务"}{task.dueDate ? ` · ${formatDueDate(task.dueDate)}` : ""}</small></span>
              </label>
            ))}
          </div>

          <div className="add-task">
            <span>＋</span>
            <input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void addTask()} placeholder={connected ? "添加到滴答清单" : "添加本次自习任务"} />
            <button onClick={() => void addTask()}>添加</button>
          </div>
          {connected && projects.length > 0 && (
            <label className="project-picker">添加至
              <select value={selectedProject} onChange={(event) => setSelectedProject(event.target.value)}>
                {projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
              </select>
            </label>
          )}
          </>}
        </aside>

        <section className="focus-stage panel">
          <div className="participant-strip">
            <div className="participant-tile active">
              <span className="tile-badge">你</span>
              {cameraStream
                ? <video className="camera-preview" ref={cameraVideoRef} autoPlay muted playsInline aria-label="你的摄像头预览" />
                : <div className="tile-preview">{stream ? "屏幕共享中 · 摄像头关闭" : "摄像头关闭"}</div>}
              <small>{cameraStream ? "摄像头已开启" : "你的学习窗口"}</small>
            </div>
            {visibleRemoteMembers.map((peerId, index) => (
              <div className="participant-tile connected" key={peerId}>
                <span className="tile-badge">{index + 1}</span>
                {remoteCameras[peerId]
                  ? <RemoteCamera stream={remoteCameras[peerId]} label={`成员 ${index + 1} 的摄像头`} />
                  : <div className="tile-preview invite-preview">摄像头关闭</div>}
                <small>成员 {index + 1} · 已连接</small>
              </div>
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
            {stream ? <video ref={videoRef} autoPlay muted playsInline aria-label="屏幕共享预览" /> : (
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
          <div className="session-controls">
            <div className="timer-block"><span>本轮剩余</span><strong>{pad(minutes)}:{pad(remainingSeconds)}</strong></div>
            <button className="timer-toggle" onClick={() => setRunning((value) => !value)}>{running ? "暂停" : seconds === 50 * 60 ? "开始专注" : "继续"}</button>
            <button className="reset-button" onClick={() => { setSeconds(50 * 60); setRunning(false); }}>重置</button>
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
            <div className="chat-notice">当前消息仅保存在此浏览器。接入房间数据库后才能让其他成员实时看到。</div>
            <div className="message-list" aria-live="polite">
              {messages.length === 0 ? <div className="empty-chat"><strong>还没有消息</strong><span>可以先记录一句本轮目标或休息提醒。</span></div> : messages.map((message) => (
                <div className="message own" key={message.id}><span>你 · {message.time}</span><p>{message.body}</p></div>
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

      <footer className="footer-note"><span>密码保护已开启</span><span>高清屏幕共享</span><span>滴答数据仅经授权读取</span></footer>

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
