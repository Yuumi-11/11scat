"use client";

import { FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Camera, CameraOff, Cloud, MicOff, MonitorUp, Palette, Presentation, Volume2 } from "lucide-react";
import { Room, RoomEvent, Track } from "livekit-client";
import type { DataConnection, MediaConnection, Peer as PeerClient, PeerOptions } from "peerjs";
import { BoardStroke, BoardText, RoomBoard, Whiteboard } from "./Whiteboard";

type Task = {
  id: string;
  projectId?: string;
  title: string;
  project: string;
  dueDate?: string;
  done: boolean;
  source: "ticktick" | "local";
};

type ChatQuote = { id: string; sender: string; body: string };
type ChatAttachment = { id: string; url: string; name: string; size: number; mimeType: string; kind: "image" | "file" };
type ChatMessage = { id: string; body: string; imageUrl?: string; attachment?: ChatAttachment; replyTo?: ChatQuote; identityId?: string; time: string; createdAt?: number; sender: string; own?: boolean };
type SharedTask = Pick<Task, "id" | "title" | "project" | "dueDate" | "done">;
type MediaSource = "camera" | "screen";
type MediaItem = {
  id: string;
  label: string;
  stream: MediaStream;
  kind: MediaSource;
  remote: boolean;
};
type CloudItem = { name: string; path: string; kind: "folder" | "file"; size: number; updatedAt: number };
type CloudStatus = { usedBytes: number; limitBytes: number; warningBytes: number; warning: boolean; percent: number };

const USE_LIVEKIT = false;
const MAX_REMOTE_DEVICES = 7;
const chatImageUrlPattern = /^\/api\/chat\/(?:images|files)\/[0-9a-f-]{36}$/i;
const INITIAL_BOARD_EPOCH = "0000000000000:initial";

const normalizeBoardStroke = (value: unknown): BoardStroke | null => {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<BoardStroke>;
  if (typeof item.id !== "string" || typeof item.color !== "string" || !/^#[0-9a-f]{6}$/i.test(item.color)
    || typeof item.width !== "number" || item.width < 1 || item.width > 120 || !Array.isArray(item.points)) return null;
  const points = item.points.slice(0, 10000).flatMap((point) => (
    point && typeof point.x === "number" && typeof point.y === "number" && Number.isFinite(point.x) && Number.isFinite(point.y)
      ? [{ x: Math.max(0, Math.min(1200, point.x)), y: Math.max(0, Math.min(720, point.y)) }]
      : []
  ));
  return {
    id: item.id.slice(0, 80), color: item.color, width: item.width, points,
    createdAt: typeof item.createdAt === "number" && Number.isFinite(item.createdAt) ? item.createdAt : 0,
    revision: typeof item.revision === "string" ? item.revision.slice(0, 120) : `${String(typeof item.createdAt === "number" ? item.createdAt : 0).padStart(13, "0")}:${item.id}`,
  };
};

const normalizeBoardText = (value: unknown): BoardText | null => {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<BoardText>;
  if (typeof item.id !== "string" || typeof item.text !== "string" || typeof item.x !== "number" || typeof item.y !== "number"
    || typeof item.width !== "number" || typeof item.height !== "number" || typeof item.color !== "string" || !/^#[0-9a-f]{6}$/i.test(item.color)) return null;
  return {
    id: item.id.slice(0, 80), text: item.text.slice(0, 4000),
    x: Math.max(0, Math.min(1200, item.x)), y: Math.max(0, Math.min(720, item.y)),
    width: Math.max(80, Math.min(1200, item.width)), height: Math.max(40, Math.min(720, item.height)),
    color: item.color, fontSize: typeof item.fontSize === "number" ? Math.max(10, Math.min(96, item.fontSize)) : 20,
    confirmed: item.confirmed !== false, updatedAt: typeof item.updatedAt === "number" && Number.isFinite(item.updatedAt) ? item.updatedAt : 0,
    revision: typeof item.revision === "string" ? item.revision.slice(0, 120) : `${String(typeof item.updatedAt === "number" ? item.updatedAt : 0).padStart(13, "0")}:${item.id}`,
  };
};

const normalizeBoard = (value: unknown): RoomBoard | null => {
  if (!value || typeof value !== "object") return null;
  const board = value as Partial<RoomBoard>;
  if (typeof board.id !== "string" || !/^[0-9a-f-]{36}$/i.test(board.id) || typeof board.name !== "string" || !Array.isArray(board.strokes)) return null;
  const strokes = board.strokes.slice(0, 2000).flatMap((stroke) => { const normalized = normalizeBoardStroke(stroke); return normalized ? [normalized] : []; });
  const texts = Array.isArray(board.texts) ? board.texts.slice(0, 200).flatMap((text) => { const normalized = normalizeBoardText(text); return normalized ? [normalized] : []; }) : [];
  const deletedStrokeIds = Array.isArray(board.deletedStrokeIds) ? board.deletedStrokeIds.filter((id): id is string => typeof id === "string").slice(-2000) : [];
  const deletedTextIds = Array.isArray(board.deletedTextIds) ? board.deletedTextIds.filter((id): id is string => typeof id === "string").slice(-500) : [];
  const deletedStrokes = new Set(deletedStrokeIds);
  const deletedTexts = new Set(deletedTextIds);
  return {
    id: board.id, name: board.name.trim().slice(0, 40) || "画板", strokes: strokes.filter((stroke) => !deletedStrokes.has(stroke.id)), texts: texts.filter((text) => !deletedTexts.has(text.id)),
    deletedStrokeIds, deletedTextIds,
    epoch: typeof board.epoch === "string" && /^\d{13}:[0-9a-z-]{1,80}$/i.test(board.epoch) ? board.epoch : INITIAL_BOARD_EPOCH,
    createdAt: typeof board.createdAt === "number" ? board.createdAt : Date.now(),
  };
};

const sortBoardStrokes = (strokes: BoardStroke[]) => [...strokes].sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));

const mergeBoard = (current: RoomBoard, incoming: RoomBoard): RoomBoard => {
  if (incoming.epoch > current.epoch) return { ...incoming, strokes: sortBoardStrokes(incoming.strokes) };
  if (incoming.epoch < current.epoch) return current;
  const strokeMap = new Map(current.strokes.map((stroke) => [stroke.id, stroke]));
  incoming.strokes.forEach((stroke) => { const previous = strokeMap.get(stroke.id); if (!previous || stroke.revision > previous.revision) strokeMap.set(stroke.id, stroke); });
  const textMap = new Map(current.texts.map((text) => [text.id, text]));
  incoming.texts.forEach((text) => { const previous = textMap.get(text.id); if (!previous || text.revision > previous.revision) textMap.set(text.id, text); });
  const deletedStrokeIds = [...new Set([...current.deletedStrokeIds, ...incoming.deletedStrokeIds])].slice(-2000);
  const deletedTextIds = [...new Set([...current.deletedTextIds, ...incoming.deletedTextIds])].slice(-500);
  const deletedStrokes = new Set(deletedStrokeIds);
  const deletedTexts = new Set(deletedTextIds);
  return { ...current, name: incoming.name || current.name, strokes: sortBoardStrokes([...strokeMap.values()].filter((stroke) => !deletedStrokes.has(stroke.id))), texts: [...textMap.values()].filter((text) => !deletedTexts.has(text.id)), deletedStrokeIds, deletedTextIds };
};

const normalizeChatAttachment = (value: unknown): ChatAttachment | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Partial<ChatAttachment>;
  if (typeof item.id !== "string" || typeof item.url !== "string" || item.url !== `/api/chat/files/${item.id}`
    || typeof item.name !== "string" || typeof item.size !== "number" || typeof item.mimeType !== "string"
    || (item.kind !== "image" && item.kind !== "file")) return undefined;
  return { id: item.id, url: item.url, name: item.name, size: item.size, mimeType: item.mimeType, kind: item.kind };
};

const validChatContent = (body: unknown, imageUrl: unknown, attachment?: unknown) => (
  (typeof body === "string" && body.trim().length > 0)
  || (typeof imageUrl === "string" && chatImageUrlPattern.test(imageUrl))
  || Boolean(normalizeChatAttachment(attachment))
);

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
};

const beijingTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const formatChatTime = (message: ChatMessage) => (
  typeof message.createdAt === "number" && Number.isFinite(message.createdAt)
    ? beijingTimeFormatter.format(new Date(message.createdAt))
    : message.time
);

const normalizeChatQuote = (value: unknown): ChatQuote | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const quote = value as Partial<ChatQuote>;
  if (typeof quote.id !== "string" || typeof quote.sender !== "string" || typeof quote.body !== "string") return undefined;
  return { id: quote.id.slice(0, 80), sender: quote.sender.trim().slice(0, 24) || "成员", body: quote.body.trim().slice(0, 160) };
};

const normalizeIncomingMessage = (value: unknown, currentIdentityId: string): ChatMessage | null => {
  if (!value || typeof value !== "object") return null;
  const message = value as Partial<ChatMessage>;
  const attachment = normalizeChatAttachment(message.attachment);
  if (typeof message.id !== "string" || typeof message.body !== "string" || typeof message.time !== "string" || typeof message.sender !== "string"
    || !validChatContent(message.body, message.imageUrl, attachment)) return null;
  const identityId = typeof message.identityId === "string" ? message.identityId.slice(0, 64) : undefined;
  return {
    id: message.id,
    body: message.body,
    imageUrl: typeof message.imageUrl === "string" && chatImageUrlPattern.test(message.imageUrl) ? message.imageUrl : undefined,
    attachment,
    replyTo: normalizeChatQuote(message.replyTo),
    identityId,
    time: message.time,
    createdAt: typeof message.createdAt === "number" ? message.createdAt : undefined,
    sender: message.sender.trim().slice(0, 24) || "成员",
    own: Boolean(identityId && identityId === currentIdentityId),
  };
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

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskView, setTaskView] = useState<"today" | "week">("today");
  const [shareMode, setShareMode] = useState<"detail" | "motion">("detail");
  const [shareModeOpen, setShareModeOpen] = useState(false);
  const [shareDialogAction, setShareDialogAction] = useState<"start" | "quality">("start");
  const [shareComputerAudio, setShareComputerAudio] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [shareStarting, setShareStarting] = useState(false);
  const [pictureInPicture, setPictureInPicture] = useState(false);
  const [shareError, setShareError] = useState("");
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [roomMembers, setRoomMembers] = useState<string[]>([]);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [displayName, setDisplayName] = useState("");
  const [identityId, setIdentityId] = useState("");
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
  const [chatImage, setChatImage] = useState<File | null>(null);
  const [chatImagePreview, setChatImagePreview] = useState("");
  const [chatImageError, setChatImageError] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatUploadProgress, setChatUploadProgress] = useState<number | null>(null);
  const [chatHistoryLoading, setChatHistoryLoading] = useState(false);
  const [chatHistoryCursor, setChatHistoryCursor] = useState<string | null>(null);
  const [chatHistoryReady, setChatHistoryReady] = useState(false);
  const [chatQuote, setChatQuote] = useState<ChatQuote | null>(null);
  const [messageMenuId, setMessageMenuId] = useState("");
  const [messageMenuPlacement, setMessageMenuPlacement] = useState<"above" | "below">("below");
  const [sideView, setSideView] = useState<"chat" | "tasks">("chat");
  const [memberTasks, setMemberTasks] = useState<Record<string, SharedTask[]>>({});
  const [activity, setActivity] = useState("");
  const [memberActivities, setMemberActivities] = useState<Record<string, string>>({});
  const [peerIdentityIds, setPeerIdentityIds] = useState<Record<string, string>>({});
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [appearanceTheme, setAppearanceTheme] = useState<"pink" | "blue" | "green" | "purple">("pink");
  const [backgroundImage, setBackgroundImage] = useState("");
  const [cloudOpen, setCloudOpen] = useState(false);
  const [cloudPath, setCloudPath] = useState("");
  const [cloudItems, setCloudItems] = useState<CloudItem[]>([]);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus | null>(null);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState("");
  const [cloudUploading, setCloudUploading] = useState(false);
  const [cloudNotice, setCloudNotice] = useState("");
  const [chatCloudUploads, setChatCloudUploads] = useState<Record<string, "uploading" | "done">>({});
  const [boards, setBoards] = useState<RoomBoard[]>([]);
  const [activeBoardId, setActiveBoardId] = useState("");
  const [boardNotice, setBoardNotice] = useState("");
  const roomRef = useRef<Room | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<PeerClient | null>(null);
  const selfPeerIdRef = useRef("");
  const hostPeerIdRef = useRef("");
  const dataConnectionsRef = useRef(new Map<string, DataConnection>());
  const tasksRef = useRef<Task[]>([]);
  const activityRef = useRef("");
  const outgoingCallsRef = useRef(new Map<string, MediaConnection>());
  const incomingCallsRef = useRef(new Map<string, MediaConnection>());
  const callPeerRef = useRef<(peerId: string, media: MediaStream, source: MediaSource) => void>(() => undefined);
  const displayNameRef = useRef("");
  const identityIdRef = useRef("");
  const memberNamesRef = useRef<Record<string, string>>({});
  const chatImageInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const cloudInputRef = useRef<HTMLInputElement>(null);
  const boardsRef = useRef<RoomBoard[]>([]);
  const messageListRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressOriginRef = useRef({ x: 0, y: 0 });
  const longPressTriggeredRef = useRef(false);
  const chatAtBottomRef = useRef(true);
  const chatSavedScrollTopRef = useRef(0);
  const pendingHistoryScrollRef = useRef<{ height: number; top: number } | null>(null);
  const notificationAudioContextRef = useRef<AudioContext | null>(null);
  const notifiedMessageIdsRef = useRef(new Set<string>());

  const broadcastRoomMessage = useCallback((message: object) => {
    void roomRef.current?.localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify(message)),
      { reliable: true },
    );
    dataConnectionsRef.current.forEach((connection) => {
      if (connection.open) connection.send(message);
    });
  }, []);

  const receiveBoardMessage = useCallback((message: { type?: string; boards?: unknown; board?: unknown; id?: unknown; boardId?: unknown; stroke?: unknown; strokeId?: unknown; text?: unknown; textId?: unknown; epoch?: unknown }) => {
    if (message.type === "board-snapshot" && Array.isArray(message.boards)) {
      const incoming = message.boards.flatMap((item) => {
        const board = normalizeBoard(item);
        return board ? [board] : [];
      }).slice(0, 12);
      setBoards((current) => {
        const merged = new Map(current.map((board) => [board.id, board]));
        incoming.forEach((board) => {
          const existing = merged.get(board.id);
          merged.set(board.id, existing ? mergeBoard(existing, board) : board);
        });
        const next = [...merged.values()].sort((left, right) => left.createdAt - right.createdAt).slice(0, 12);
        boardsRef.current = next;
        return next;
      });
      return true;
    }
    if (message.type === "board-create" || message.type === "board-upsert") {
      const board = normalizeBoard(message.board);
      if (!board) return true;
      setBoards((current) => {
        const next = current.some((item) => item.id === board.id)
          ? current.map((item) => item.id === board.id ? mergeBoard(item, board) : item)
          : [...current, board].slice(0, 12);
        boardsRef.current = next;
        return next;
      });
      return true;
    }
    if (typeof message.boardId === "string" && typeof message.epoch === "string") {
      if (message.type === "board-clear") {
        setBoards((current) => {
          const next = current.map((board) => board.id === message.boardId && message.epoch! > board.epoch
            ? { ...board, epoch: message.epoch as string, strokes: [], texts: [], deletedStrokeIds: [], deletedTextIds: [] }
            : board);
          boardsRef.current = next;
          return next;
        });
        return true;
      }
      if (message.type === "board-stroke-add") {
        const stroke = normalizeBoardStroke(message.stroke);
        if (!stroke) return true;
        setBoards((current) => {
          const next = current.map((board) => {
            if (board.id !== message.boardId || board.epoch !== message.epoch || board.deletedStrokeIds.includes(stroke.id)) return board;
            const previous = board.strokes.find((item) => item.id === stroke.id);
            if (previous && previous.revision >= stroke.revision) return board;
            return { ...board, strokes: sortBoardStrokes(previous ? board.strokes.map((item) => item.id === stroke.id ? stroke : item) : [...board.strokes, stroke]).slice(-2000) };
          });
          boardsRef.current = next;
          return next;
        });
        return true;
      }
      if (message.type === "board-stroke-delete" && typeof message.strokeId === "string") {
        setBoards((current) => {
          const next = current.map((board) => board.id === message.boardId && board.epoch === message.epoch
            ? { ...board, strokes: board.strokes.filter((stroke) => stroke.id !== message.strokeId), deletedStrokeIds: [...new Set([...board.deletedStrokeIds, message.strokeId as string])].slice(-2000) }
            : board);
          boardsRef.current = next;
          return next;
        });
        return true;
      }
      if (message.type === "board-text-upsert") {
        const text = normalizeBoardText(message.text);
        if (!text) return true;
        setBoards((current) => {
          const next = current.map((board) => {
            if (board.id !== message.boardId || board.epoch !== message.epoch || board.deletedTextIds.includes(text.id)) return board;
            const previous = board.texts.find((item) => item.id === text.id);
            if (previous && previous.revision >= text.revision) return board;
            return { ...board, texts: previous ? board.texts.map((item) => item.id === text.id ? text : item) : [...board.texts, text].slice(-200) };
          });
          boardsRef.current = next;
          return next;
        });
        return true;
      }
      if (message.type === "board-text-delete" && typeof message.textId === "string") {
        setBoards((current) => {
          const next = current.map((board) => board.id === message.boardId && board.epoch === message.epoch
            ? { ...board, texts: board.texts.filter((text) => text.id !== message.textId), deletedTextIds: [...new Set([...board.deletedTextIds, message.textId as string])].slice(-500) }
            : board);
          boardsRef.current = next;
          return next;
        });
        return true;
      }
    }
    if (message.type === "board-delete" && typeof message.id === "string") {
      setBoards((current) => {
        const next = current.filter((item) => item.id !== message.id);
        boardsRef.current = next;
        return next;
      });
      setActiveBoardId((current) => current === message.id ? "" : current);
      return true;
    }
    return false;
  }, []);

  const playNotificationSound = useCallback((messageId: string) => {
    if (notifiedMessageIdsRef.current.has(messageId)) return;
    if (notifiedMessageIdsRef.current.size > 500) notifiedMessageIdsRef.current.clear();
    notifiedMessageIdsRef.current.add(messageId);
    try {
      const context = notificationAudioContextRef.current || new window.AudioContext();
      notificationAudioContextRef.current = context;
      void context.resume().then(() => {
        const start = context.currentTime;
        const gain = context.createGain();
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.12, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.34);
        gain.connect(context.destination);
        [659.25, 880].forEach((frequency, index) => {
          const oscillator = context.createOscillator();
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(frequency, start + index * 0.08);
          oscillator.connect(gain);
          oscillator.start(start + index * 0.08);
          oscillator.stop(start + 0.34);
        });
      }).catch(() => undefined);
    } catch { /* Audio may be unavailable until the browser allows playback. */ }
  }, []);

  useEffect(() => {
    const unlockAudio = () => {
      try {
        const context = notificationAudioContextRef.current || new window.AudioContext();
        notificationAudioContextRef.current = context;
        if (context.state === "suspended") void context.resume();
      } catch { /* Web Audio is optional. */ }
    };
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      void notificationAudioContextRef.current?.close();
      notificationAudioContextRef.current = null;
    };
  }, []);

  useEffect(() => () => {
    if (chatImagePreview) URL.revokeObjectURL(chatImagePreview);
  }, [chatImagePreview]);

  useEffect(() => () => {
    if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
  }, []);

  useEffect(() => {
    if (!messageMenuId) return;
    const closeMenu = (event: PointerEvent) => {
      if (!(event.target as Element | null)?.closest(".message-action-menu")) setMessageMenuId("");
    };
    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, [messageMenuId]);

  const scrollChatToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const list = messageListRef.current;
    if (list) {
      list.scrollTo({ top: list.scrollHeight, behavior });
      chatSavedScrollTopRef.current = list.scrollHeight;
      chatAtBottomRef.current = true;
    }
  }, []);

  useLayoutEffect(() => {
    if (sideView !== "chat") return;
    const list = messageListRef.current;
    if (!list) return;
    const pending = pendingHistoryScrollRef.current;
    if (pending) {
      list.scrollTop = pending.top + (list.scrollHeight - pending.height);
      chatSavedScrollTopRef.current = list.scrollTop;
      pendingHistoryScrollRef.current = null;
      return;
    }
    if (chatAtBottomRef.current) scrollChatToBottom("auto");
    else list.scrollTop = chatSavedScrollTopRef.current;
  }, [messages, sideView, scrollChatToBottom]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem("11scat-appearance-theme");
        if (["pink", "blue", "green", "purple"].includes(saved || "")) setAppearanceTheme(saved as "pink" | "blue" | "green" | "purple");
        setBackgroundImage(window.localStorage.getItem("11scat-appearance-background") || "");
      } catch { /* Appearance remains at defaults when storage is unavailable. */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const loadTasks = useCallback(async () => {
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
  }, [taskView]);

  const mergeChatMessages = (incoming: ChatMessage[], current: ChatMessage[]) => {
    const byId = new Map<string, ChatMessage>();
    [...incoming, ...current].forEach((message) => byId.set(message.id, message));
    return [...byId.values()].sort((left, right) => (left.createdAt || 0) - (right.createdAt || 0) || left.id.localeCompare(right.id));
  };

  const loadOlderChatMessages = async () => {
    if (chatHistoryLoading || !chatHistoryCursor) return;
    const list = messageListRef.current;
    if (list) pendingHistoryScrollRef.current = { height: list.scrollHeight, top: list.scrollTop };
    setChatHistoryLoading(true);
    try {
      const response = await fetch(`/api/chat/messages?limit=30&before=${encodeURIComponent(chatHistoryCursor)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("无法加载更早消息");
      const data = await response.json() as { messages?: unknown; nextCursor?: unknown };
      const incoming = Array.isArray(data.messages)
        ? data.messages.map((item) => normalizeIncomingMessage(item, identityIdRef.current)).filter((item): item is ChatMessage => Boolean(item))
        : [];
      setMessages((current) => mergeChatMessages(incoming, current));
      setChatHistoryCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
    } catch (error) {
      pendingHistoryScrollRef.current = null;
      setChatImageError(error instanceof Error ? error.message : "无法加载更早消息");
    } finally {
      setChatHistoryLoading(false);
    }
  };

  const handleChatScroll = () => {
    const list = messageListRef.current;
    if (!list) return;
    chatSavedScrollTopRef.current = list.scrollTop;
    chatAtBottomRef.current = list.scrollHeight - list.clientHeight - list.scrollTop <= 24;
    if (list.scrollTop <= 20 && chatHistoryCursor && !chatHistoryLoading) void loadOlderChatMessages();
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadTasks(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadTasks]);

  useEffect(() => {
    if (!joined || chatHistoryReady || !identityIdRef.current) return;
    let disposed = false;
    const loadInitialChat = async () => {
      setChatHistoryLoading(true);
      try {
        const response = await fetch("/api/chat/messages?limit=30", { cache: "no-store" });
        if (!response.ok) throw new Error("无法加载聊天记录");
        const data = await response.json() as { messages?: unknown; nextCursor?: unknown };
        if (disposed) return;
        const incoming = Array.isArray(data.messages)
          ? data.messages.map((item) => normalizeIncomingMessage(item, identityIdRef.current)).filter((item): item is ChatMessage => Boolean(item))
          : [];
        chatAtBottomRef.current = true;
        setMessages((current) => mergeChatMessages(incoming, current));
        setChatHistoryCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
      } catch (error) {
        if (!disposed) setChatImageError(error instanceof Error ? error.message : "无法加载聊天记录");
      } finally {
        if (!disposed) { setChatHistoryLoading(false); setChatHistoryReady(true); }
      }
    };
    void loadInitialChat();
    return () => { disposed = true; };
  }, [joined, chatHistoryReady]);

  useEffect(() => {
    let disposed = false;
    const loadProfile = async () => {
      try {
        const response = await fetch("/api/identity/me", { cache: "no-store" });
        if (!response.ok) throw new Error("profile unavailable");
        const data = await response.json() as { identityId?: unknown; nickname?: unknown };
        const nickname = typeof data.nickname === "string" ? data.nickname.trim().slice(0, 24) : "";
        const fullIdentityId = typeof data.identityId === "string" ? data.identityId.trim().slice(0, 64) : "";
        const identityName = fullIdentityId.slice(0, 24);
        if (!disposed) {
          identityIdRef.current = fullIdentityId;
          setIdentityId(fullIdentityId);
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

  useEffect(() => {
    const entered = () => setPictureInPicture(true);
    const left = () => setPictureInPicture(false);
    document.addEventListener("enterpictureinpicture", entered, true);
    document.addEventListener("leavepictureinpicture", left, true);
    return () => {
      document.removeEventListener("enterpictureinpicture", entered, true);
      document.removeEventListener("leavepictureinpicture", left, true);
    };
  }, []);

  useEffect(() => { activityRef.current = activity.trim().slice(0, 80); }, [activity]);
  useEffect(() => { boardsRef.current = boards; }, [boards]);
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
    room.on(RoomEvent.ParticipantConnected, () => {
      refreshMembers();
      void room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify({ type: "board-snapshot", boards: boardsRef.current })),
        { reliable: true },
      );
    });
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
        const message = JSON.parse(new TextDecoder().decode(payload)) as ChatMessage & { type?: string; tasks?: unknown; activity?: unknown; boards?: unknown; board?: unknown };
        if (receiveBoardMessage(message)) return;
        if (message.type === "chat-recall" && typeof message.id === "string") {
          setMessages((current) => current.filter((item) => item.id !== message.id));
          return;
        }
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
        if (message.type !== "chat") return;
        const normalized = normalizeIncomingMessage(message, identityIdRef.current);
        if (!normalized) return;
        const incomingMessage: ChatMessage = { ...normalized, sender: participant?.name?.trim() || normalized.sender || participant?.identity || "成员" };
        playNotificationSound(incomingMessage.id);
        setMessages((current) => current.some((item) => item.id === incomingMessage.id) ? current : [...current, incomingMessage]);
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
  }, [displayName, joined, playNotificationSound, receiveBoardMessage]);

  useEffect(() => {
    if (!joined || USE_LIVEKIT) return;
    let disposed = false;
    let localPeer: PeerClient | null = null;
    const connections = dataConnectionsRef.current;
    const outgoingCalls = outgoingCallsRef.current;
    const incomingCalls = incomingCallsRef.current;
    const peerDeviceIds = new Map<string, string>();
    const peerRemovalTimers = new Map<string, number>();
    const pendingPeerIds = new Set<string>();
    let localDeviceId = "";
    let reconnectTimer: number | null = null;
    let recoveryMessageTimer: number | null = null;
    let presenceTimer: number | null = null;
    let reconnectAttempts = 0;
    let initializingRoom = false;

    const clearReconnectTimer = () => {
      if (reconnectTimer === null) return;
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    };

    const clearRecoveryMessageTimer = () => {
      if (recoveryMessageTimer === null) return;
      window.clearTimeout(recoveryMessageTimer);
      recoveryMessageTimer = null;
    };

    const recoverRoomConnection = () => {
      if (disposed) return;
      if (!navigator.onLine) {
        setRoomStatus("connecting");
        setRoomError("网络已断开，恢复后会自动重新连接。");
        return;
      }
      const peer = localPeer;
      if (!peer || peer.destroyed) {
        void initializeRoom();
        return;
      }
      if (peer.disconnected) {
        try { peer.reconnect(); } catch {
          peer.destroy();
          if (localPeer === peer) localPeer = null;
          void initializeRoom();
        }
        return;
      }
      if (peer.open) {
        clearRecoveryMessageTimer();
        reconnectAttempts = 0;
        setRoomStatus("ready");
        setRoomError("");
        const hostId = hostPeerIdRef.current;
        if (hostId && hostId !== peer.id && !connections.has(hostId)) connectToPeer(hostId);
      }
    };

    const scheduleRoomRecovery = (delay = 700) => {
      if (disposed || reconnectTimer !== null) return;
      if (recoveryMessageTimer === null) {
        recoveryMessageTimer = window.setTimeout(() => {
          recoveryMessageTimer = null;
          if (disposed || localPeer?.open) return;
          setRoomStatus("connecting");
          setRoomError(navigator.onLine ? "房间连接正在自动恢复，请稍候。" : "网络已断开，恢复后会自动重新连接。");
        }, 10_000);
      }
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        recoverRoomConnection();
        if (!disposed && navigator.onLine && (!localPeer?.open || localPeer.disconnected)) {
          reconnectAttempts += 1;
          scheduleRoomRecovery(Math.min(700 * (2 ** reconnectAttempts), 10000));
        }
      }, delay);
    };

    const syncRoomPresence = async () => {
      const peer = localPeer;
      if (disposed || !peer?.open || !peer.id || !localDeviceId) return;
      try {
        const response = await fetch("/api/room/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ peerId: peer.id, deviceId: localDeviceId, name: displayNameRef.current }),
          cache: "no-store",
        });
        if (!response.ok) throw new Error("presence unavailable");
        const data = await response.json() as { participants?: unknown };
        if (!Array.isArray(data.participants)) return;
        const discovered = data.participants.filter((item): item is { peerId: string; deviceId: string; name: string; identityId: string } => Boolean(
          item && typeof item === "object"
          && typeof (item as { peerId?: unknown }).peerId === "string"
          && typeof (item as { deviceId?: unknown }).deviceId === "string"
          && typeof (item as { name?: unknown }).name === "string"
          && typeof (item as { identityId?: unknown }).identityId === "string",
        )).filter((item) => item.peerId !== peer.id && item.deviceId !== localDeviceId);
        discovered.forEach((item) => {
          const replacedPeerId = Array.from(peerDeviceIds.entries()).find(([candidate, deviceId]) => candidate !== item.peerId && deviceId === item.deviceId)?.[0];
          if (replacedPeerId) removePeer(replacedPeerId);
          peerDeviceIds.set(item.peerId, item.deviceId);
          rememberPeerName(item.peerId, item.name);
          rememberPeerIdentity(item.peerId, item.identityId);
        });
        const roomPeerIds = [peer.id, ...discovered.map((item) => item.peerId)].sort();
        hostPeerIdRef.current = roomPeerIds[0] || peer.id;
        discovered
          .map((item) => item.peerId)
          .sort()
          .forEach((peerId) => {
            if (peer.id.localeCompare(peerId) < 0) connectToPeer(peerId);
          });
      } catch {
        if (!disposed && document.visibilityState === "visible") scheduleRoomRecovery(1200);
      }
    };

    const startPresenceHeartbeat = () => {
      if (presenceTimer !== null) window.clearInterval(presenceTimer);
      void syncRoomPresence();
      presenceTimer = window.setInterval(() => void syncRoomPresence(), 5000);
    };

    const leaveRoomPresence = () => {
      if (!localDeviceId) return;
      void fetch("/api/room/presence", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: localDeviceId }),
        keepalive: true,
      });
    };

    const rememberPeerName = (peerId: string, value: unknown) => {
      const name = typeof value === "string" ? value.trim().slice(0, 24) : "";
      if (!name) return;
      setMemberNames((current) => current[peerId] === name ? current : { ...current, [peerId]: name });
    };

    const rememberPeerIdentity = (peerId: string, value: unknown) => {
      const identityId = typeof value === "string" ? value.trim().slice(0, 64) : "";
      if (!identityId) return;
      setPeerIdentityIds((current) => current[peerId] === identityId ? current : { ...current, [peerId]: identityId });
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
      const removalTimer = peerRemovalTimers.get(peerId);
      if (removalTimer !== undefined) window.clearTimeout(removalTimer);
      peerRemovalTimers.delete(peerId);
      connections.delete(peerId);
      peerDeviceIds.delete(peerId);
      pendingPeerIds.delete(peerId);
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
      setPeerIdentityIds((current) => {
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

    const schedulePeerRemoval = (peerId: string) => {
      if (peerRemovalTimers.has(peerId)) return;
      peerRemovalTimers.set(peerId, window.setTimeout(() => {
        peerRemovalTimers.delete(peerId);
        if (!connections.get(peerId)?.open) removePeer(peerId);
      }, 10_000));
    };

    const callPeer = (peerId: string, media: MediaStream, source: MediaSource, attempt = 0) => {
      if (!localPeer?.open || !connections.get(peerId)?.open) return;
      const key = `${source}:${peerId}`;
      const existing = outgoingCalls.get(key);
      if (existing?.open) return;
      existing?.close();

      const call = localPeer.call(peerId, media, { metadata: { source, name: displayNameRef.current, identityId: identityIdRef.current } });
      outgoingCalls.set(key, call);
      const retry = () => {
        if (disposed || outgoingCalls.get(key) !== call) return;
        outgoingCalls.delete(key);
        call.close();
        const currentStream = source === "camera" ? cameraStreamRef.current : screenStreamRef.current;
        if (!currentStream || currentStream !== media || attempt >= 3) return;
        window.setTimeout(() => callPeer(peerId, currentStream, source, attempt + 1), 900 * (attempt + 1));
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
      const openConnections = Array.from(connections.values()).filter((item) => item.open).length;
      if (!localPeer?.open || !peerId || peerId === selfId || connections.get(peerId)?.open || pendingPeerIds.has(peerId) || openConnections >= MAX_REMOTE_DEVICES) return;
      pendingPeerIds.add(peerId);
      try {
        bindConnection(localPeer.connect(peerId, {
          reliable: true,
          metadata: { room: "11scat-global-room", name: displayNameRef.current, deviceId: localDeviceId, identityId: identityIdRef.current },
        }));
      } catch {
        pendingPeerIds.delete(peerId);
      }
    }

    function bindConnection(connection: DataConnection, incoming = false) {
      const peerId = connection.peer;

      const handleOpen = () => {
        if (disposed) return;
        const graceTimer = peerRemovalTimers.get(peerId);
        if (graceTimer !== undefined) window.clearTimeout(graceTimer);
        peerRemovalTimers.delete(peerId);
        pendingPeerIds.delete(peerId);
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
        const openConnections = Array.from(connections.values()).filter((item) => item.open).length;
        if (!existing?.open && openConnections >= MAX_REMOTE_DEVICES) {
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
        rememberPeerIdentity(peerId, connection.metadata?.identityId);
        setRoomError("");
        refreshMembers();
        connection.send({ type: "presence", name: displayNameRef.current, identityId: identityIdRef.current, deviceId: localDeviceId, activity: activityRef.current });
        connection.send({
          type: "task-snapshot",
          tasks: tasksRef.current.filter((task) => !task.done).slice(0, 50).map(({ id, title, project, dueDate, done }) => ({ id, title, project, dueDate, done })),
        });
        connection.send({ type: "media-request" });
        connection.send({ type: "board-snapshot", boards: boardsRef.current });
        if (hostPeerIdRef.current === selfPeerIdRef.current) broadcastPeerList();
        if (cameraStreamRef.current) callPeer(peerId, cameraStreamRef.current, "camera");
        if (screenStreamRef.current) callPeer(peerId, screenStreamRef.current, "screen");
      };

      connection.on("open", handleOpen);
      connection.on("data", (payload) => {
        if (!payload || typeof payload !== "object" || !("type" in payload)) return;
        const message = payload as { type: string; ids?: unknown; tasks?: unknown; id?: unknown; body?: unknown; imageUrl?: unknown; attachment?: unknown; replyTo?: unknown; identityId?: unknown; time?: unknown; createdAt?: unknown; sender?: unknown; name?: unknown; deviceId?: unknown; activity?: unknown; boards?: unknown; board?: unknown };
        if (receiveBoardMessage(message)) return;
        if (message.type === "chat-recall" && typeof message.id === "string") {
          setMessages((current) => current.filter((item) => item.id !== message.id));
          return;
        }
        if (message.type === "presence") {
          rememberPeerName(peerId, message.name);
          rememberPeerIdentity(peerId, message.identityId);
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
        if (message.type === "chat") {
          const normalized = normalizeIncomingMessage(message, identityIdRef.current);
          if (!normalized) return;
          const incomingMessage: ChatMessage = {
            ...normalized,
            sender: normalized.sender || memberNamesRef.current[peerId] || "成员",
          };
          playNotificationSound(incomingMessage.id);
          setMessages((current) => current.some((item) => item.id === incomingMessage.id) ? current : [...current, incomingMessage]);
          return;
        }
        if (message.type !== "peer-list" || !Array.isArray(message.ids)) return;

        const selfId = selfPeerIdRef.current;
        message.ids.forEach((candidate) => {
          if (typeof candidate !== "string" || candidate === selfId || connections.get(candidate)?.open) return;
          if (candidate === hostPeerIdRef.current || selfId.localeCompare(candidate) < 0) connectToPeer(candidate);
        });
      });
      connection.on("close", () => {
        pendingPeerIds.delete(peerId);
        if (connections.get(peerId) !== connection) return;
        schedulePeerRemoval(peerId);
        if (hostPeerIdRef.current === selfPeerIdRef.current) broadcastPeerList();
      });
      connection.on("error", () => {
        pendingPeerIds.delete(peerId);
        schedulePeerRemoval(peerId);
      });
      if (connection.open) handleOpen();
    }

    const initializeRoom = async () => {
      if (disposed || initializingRoom) return;
      initializingRoom = true;
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

        const handleCall = (call: MediaConnection) => {
          const peerId = call.peer;
          const source: MediaSource = call.metadata?.source === "screen" ? "screen" : "camera";
          rememberPeerName(peerId, call.metadata?.name);
          rememberPeerIdentity(peerId, call.metadata?.identityId);
          const key = `${source}:${peerId}`;
          incomingCalls.get(key)?.close();
          incomingCalls.set(key, call);
          call.answer();
          call.on("stream", (remoteStream) => {
            if (disposed) return;
            const setter = source === "camera" ? setRemoteCameras : setRemoteScreens;
            setter((current) => ({ ...current, [peerId]: remoteStream }));
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

        const attachPeer = (peer: PeerClient) => {
          localPeer = peer;
          peerRef.current = peer;
          peer.on("open", (id) => {
            if (disposed) return;
            clearReconnectTimer();
            clearRecoveryMessageTimer();
            reconnectAttempts = 0;
            selfPeerIdRef.current = id;
            hostPeerIdRef.current = id;
            const stableInviteUrl = `${window.location.origin}${window.location.pathname}`;
            setInviteUrl(stableInviteUrl);
            if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
            setRoomStatus("ready");
            setRoomError("");
            startPresenceHeartbeat();
          });
          peer.on("connection", (connection) => bindConnection(connection, true));
          peer.on("call", handleCall);
          peer.on("disconnected", () => {
            if (!disposed && localPeer === peer) scheduleRoomRecovery();
          });
          peer.on("error", (error) => {
            if (error.type === "peer-unavailable") {
              void syncRoomPresence();
              return;
            }
            if (error.type === "webrtc") {
              setRoomError("画面连接正在重试，请稍候。");
              return;
            }
            if (["disconnected", "network", "server-error", "socket-error", "socket-closed"].includes(error.type)) {
              scheduleRoomRecovery();
              return;
            }
            setRoomStatus("error");
            setRoomError("实时房间连接失败，请检查代理网络后刷新页面。");
          });
        };

        attachPeer(new Peer(peerOptions));
      } catch {
        setRoomStatus("error");
        setRoomError("实时房间组件加载失败，请刷新页面重试。");
      } finally {
        initializingRoom = false;
      }
    };

    const recoverWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      clearReconnectTimer();
      recoverRoomConnection();
      void syncRoomPresence();
    };
    const recoverWhenActive = () => {
      clearReconnectTimer();
      recoverRoomConnection();
      void syncRoomPresence();
    };
    document.addEventListener("visibilitychange", recoverWhenVisible);
    window.addEventListener("focus", recoverWhenActive);
    window.addEventListener("online", recoverWhenActive);
    window.addEventListener("pageshow", recoverWhenActive);
    void initializeRoom();

    return () => {
      disposed = true;
      clearReconnectTimer();
      clearRecoveryMessageTimer();
      if (presenceTimer !== null) window.clearInterval(presenceTimer);
      leaveRoomPresence();
      document.removeEventListener("visibilitychange", recoverWhenVisible);
      window.removeEventListener("focus", recoverWhenActive);
      window.removeEventListener("online", recoverWhenActive);
      window.removeEventListener("pageshow", recoverWhenActive);
      callPeerRef.current = () => undefined;
      connections.forEach((connection) => connection.close());
      outgoingCalls.forEach((call) => call.close());
      incomingCalls.forEach((call) => call.close());
      connections.clear();
      outgoingCalls.clear();
      incomingCalls.clear();
      pendingPeerIds.clear();
      peerRemovalTimers.forEach((timer) => window.clearTimeout(timer));
      peerRemovalTimers.clear();
      localPeer?.destroy();
      peerRef.current = null;
    };
  }, [joined, playNotificationSound, receiveBoardMessage]);

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

  const startShare = async (mode: "detail" | "motion", withComputerAudio: boolean) => {
    if (shareStarting) return;
    setShareError("");
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setShareError("当前浏览器不支持屏幕共享，请使用最新版 Chrome、Edge 或 Safari。");
      return;
    }
    setShareStarting(true);
    try {
      const detailMode = mode === "detail";
      const nextStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "window",
          width: { ideal: detailMode ? 2560 : 1920 },
          height: { ideal: detailMode ? 1440 : 1080 },
          frameRate: { ideal: detailMode ? 15 : 30, max: detailMode ? 20 : 60 },
        },
        audio: withComputerAudio,
      });
      const track = nextStream.getVideoTracks()[0];
      if (!track || track.readyState !== "live") throw new Error("No live screen track");
      track.contentHint = detailMode ? "detail" : "motion";
      track.addEventListener("ended", () => {
        nextStream.getTracks().forEach((item) => { void roomRef.current?.localParticipant.unpublishTrack(item); item.stop(); });
        if (screenStreamRef.current === nextStream) {
          screenStreamRef.current = null;
          setStream(null);
        }
      });
      if (roomRef.current) {
        await roomRef.current.localParticipant.publishTrack(track, { source: Track.Source.ScreenShare });
        const audioTrack = nextStream.getAudioTracks()[0];
        if (audioTrack) await roomRef.current.localParticipant.publishTrack(audioTrack, { source: Track.Source.ScreenShareAudio });
      }
      stream?.getTracks().forEach((item) => item.stop());
      screenStreamRef.current = nextStream;
      setStream(nextStream);
      setShareMode(mode);
      setActiveMediaId("self-screen");
      if (withComputerAudio && nextStream.getAudioTracks().length === 0) {
        setShareError("画面已开始共享，但当前浏览器或所选窗口没有提供电脑音频。可改选支持音频的标签页或整个屏幕。");
      }
    } catch (error) {
      if ((error as DOMException).name !== "NotAllowedError") setShareError("没有成功开始共享，请重新选择窗口或屏幕。");
    } finally { setShareStarting(false); }
  };

  const chooseShareMode = async (mode: "detail" | "motion") => {
    setShareMode(mode);
    setShareModeOpen(false);
    const track = stream?.getVideoTracks()[0];
    if (shareDialogAction === "start" || !track) {
      await startShare(mode, shareComputerAudio);
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
    const current = screenStreamRef.current || stream;
    current?.getTracks().forEach((track) => { void roomRef.current?.localParticipant.unpublishTrack(track); track.stop(); });
    screenStreamRef.current = null;
    setStream(null);
    if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => undefined);
  };

  const openShareDialog = (action: "start" | "quality") => {
    setShareDialogAction(action);
    setShareModeOpen(true);
  };

  const chooseAppearanceTheme = (theme: "pink" | "blue" | "green" | "purple") => {
    setAppearanceTheme(theme);
    try { window.localStorage.setItem("11scat-appearance-theme", theme); } catch { /* keep session-only setting */ }
  };

  const importBackground = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setChatImageError("背景请选择图片文件");
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") return;
      setBackgroundImage(reader.result);
      try { window.localStorage.setItem("11scat-appearance-background", reader.result); } catch { /* Large backgrounds remain available for this session. */ }
    });
    reader.readAsDataURL(file);
  };

  const clearBackground = () => {
    setBackgroundImage("");
    try { window.localStorage.removeItem("11scat-appearance-background"); } catch { /* ignore unavailable storage */ }
  };

  const togglePictureInPicture = async () => {
    setShareError("");
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setPictureInPicture(false);
        return;
      }
      const video = document.querySelector<HTMLVideoElement>("video.main-media.screen");
      if (!video) throw new Error("请先选择一个共享画面");
      await video.play();
      if (document.pictureInPictureEnabled && video.requestPictureInPicture) {
        await video.requestPictureInPicture();
        setPictureInPicture(true);
        return;
      }
      const safariVideo = video as HTMLVideoElement & { webkitSupportsPresentationMode?: (mode: string) => boolean; webkitSetPresentationMode?: (mode: string) => void };
      if (safariVideo.webkitSupportsPresentationMode?.("picture-in-picture") && safariVideo.webkitSetPresentationMode) {
        safariVideo.webkitSetPresentationMode("picture-in-picture");
        setPictureInPicture(true);
        return;
      }
      throw new Error("当前浏览器不支持共享画面小窗");
    } catch (error) {
      setShareError(error instanceof Error ? error.message : "小窗开启失败，请重试");
    }
  };

  const loadCloudFolder = async (path = cloudPath) => {
    setCloudLoading(true);
    setCloudError("");
    try {
      const response = await fetch(`/api/cloud?path=${encodeURIComponent(path)}`, { cache: "no-store" });
      const result = await response.json().catch(() => null) as { path?: unknown; items?: unknown; status?: unknown; error?: unknown } | null;
      if (!response.ok || !Array.isArray(result?.items)) throw new Error(typeof result?.error === "string" ? result.error : "云盘加载失败");
      setCloudPath(typeof result.path === "string" ? result.path : path);
      setCloudItems(result.items as CloudItem[]);
      setCloudStatus(result.status as CloudStatus);
    } catch (error) { setCloudError(error instanceof Error ? error.message : "云盘加载失败"); }
    finally { setCloudLoading(false); }
  };

  const openCloud = () => {
    setCloudOpen(true);
    setCloudNotice("");
    void loadCloudFolder("");
  };

  const createCloudFolder = async () => {
    const name = window.prompt("新文件夹名称");
    if (!name?.trim()) return;
    const response = await fetch("/api/cloud/folders", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: cloudPath, name }),
    });
    const result = await response.json().catch(() => null) as { error?: unknown } | null;
    if (!response.ok) { setCloudError(typeof result?.error === "string" ? result.error : "创建文件夹失败"); return; }
    setCloudNotice("文件夹已创建");
    await loadCloudFolder(cloudPath);
  };

  const uploadCloudFile = async (file?: File) => {
    if (!file || cloudUploading) return;
    setCloudUploading(true);
    setCloudError("");
    setCloudNotice("");
    try {
      const response = await fetch(`/api/cloud/files?path=${encodeURIComponent(cloudPath)}`, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name || "file") },
        body: file,
      });
      const result = await response.json().catch(() => null) as { error?: unknown } | null;
      if (!response.ok) throw new Error(typeof result?.error === "string" ? result.error : "上传失败，请重试");
      setCloudNotice(`${file.name} 已上传`);
      await loadCloudFolder(cloudPath);
    } catch (error) { setCloudError(error instanceof Error ? error.message : "上传失败，请重试"); }
    finally { setCloudUploading(false); }
  };

  const uploadChatImageToCloud = async (attachment: ChatAttachment) => {
    if (chatCloudUploads[attachment.id]) return;
    setChatCloudUploads((current) => ({ ...current, [attachment.id]: "uploading" }));
    setChatImageError("");
    try {
      const response = await fetch("/api/cloud/import-chat", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attachmentId: attachment.id }),
      });
      const result = await response.json().catch(() => null) as { error?: unknown } | null;
      if (!response.ok) throw new Error(typeof result?.error === "string" ? result.error : "上传到云盘失败");
      setChatCloudUploads((current) => ({ ...current, [attachment.id]: "done" }));
      const statusResponse = await fetch("/api/cloud", { cache: "no-store" });
      const statusResult = await statusResponse.json().catch(() => null) as { status?: CloudStatus } | null;
      if (statusResult?.status) setCloudStatus(statusResult.status);
    } catch (error) {
      setChatCloudUploads((current) => { const next = { ...current }; delete next[attachment.id]; return next; });
      setChatImageError(error instanceof Error ? error.message : "上传到云盘失败");
    }
  };

  const createBoard = () => {
    const board: RoomBoard = { id: crypto.randomUUID(), name: `画板 ${boardsRef.current.length + 1}`, strokes: [], texts: [], deletedStrokeIds: [], deletedTextIds: [], epoch: INITIAL_BOARD_EPOCH, createdAt: Date.now() };
    const next = [...boardsRef.current, board].slice(0, 12);
    boardsRef.current = next;
    setBoards(next);
    setActiveBoardId(board.id);
    setActiveMediaId("");
    broadcastRoomMessage({ type: "board-create", board });
  };

  const addBoardStroke = (boardId: string, stroke: BoardStroke, epoch: string) => {
    const next = boardsRef.current.map((board) => {
      if (board.id !== boardId || board.epoch !== epoch || board.deletedStrokeIds.includes(stroke.id)) return board;
      const previous = board.strokes.find((item) => item.id === stroke.id);
      if (previous && previous.revision >= stroke.revision) return board;
      return { ...board, strokes: sortBoardStrokes(previous ? board.strokes.map((item) => item.id === stroke.id ? stroke : item) : [...board.strokes, stroke]).slice(-2000) };
    });
    boardsRef.current = next; setBoards(next);
    broadcastRoomMessage({ type: "board-stroke-add", boardId, stroke, epoch });
  };

  const deleteBoardStroke = (boardId: string, strokeId: string, epoch: string) => {
    const next = boardsRef.current.map((board) => board.id === boardId && board.epoch === epoch
      ? { ...board, strokes: board.strokes.filter((stroke) => stroke.id !== strokeId), deletedStrokeIds: [...new Set([...board.deletedStrokeIds, strokeId])].slice(-2000) }
      : board);
    boardsRef.current = next; setBoards(next);
    broadcastRoomMessage({ type: "board-stroke-delete", boardId, strokeId, epoch });
  };

  const clearBoard = (boardId: string) => {
    const epoch = `${Date.now().toString().padStart(13, "0")}:${crypto.randomUUID()}`;
    const next = boardsRef.current.map((board) => board.id === boardId ? { ...board, epoch, strokes: [], texts: [], deletedStrokeIds: [], deletedTextIds: [] } : board);
    boardsRef.current = next; setBoards(next);
    broadcastRoomMessage({ type: "board-clear", boardId, epoch });
  };

  const upsertBoardText = (boardId: string, text: BoardText, epoch: string) => {
    const next = boardsRef.current.map((board) => {
      if (board.id !== boardId || board.epoch !== epoch || board.deletedTextIds.includes(text.id)) return board;
      const previous = board.texts.find((item) => item.id === text.id);
      if (previous && previous.revision >= text.revision) return board;
      return { ...board, texts: previous ? board.texts.map((item) => item.id === text.id ? text : item) : [...board.texts, text].slice(-200) };
    });
    boardsRef.current = next; setBoards(next);
    broadcastRoomMessage({ type: "board-text-upsert", boardId, text, epoch });
  };

  const deleteBoardText = (boardId: string, textId: string, epoch: string) => {
    const next = boardsRef.current.map((board) => board.id === boardId && board.epoch === epoch
      ? { ...board, texts: board.texts.filter((text) => text.id !== textId), deletedTextIds: [...new Set([...board.deletedTextIds, textId])].slice(-500) }
      : board);
    boardsRef.current = next; setBoards(next);
    broadcastRoomMessage({ type: "board-text-delete", boardId, textId, epoch });
  };

  const deleteBoard = (id: string) => {
    const next = boardsRef.current.filter((item) => item.id !== id);
    boardsRef.current = next;
    setBoards(next);
    setActiveBoardId((current) => current === id ? "" : current);
    broadcastRoomMessage({ type: "board-delete", id });
  };

  useEffect(() => {
    if (!joined) return;
    let disposed = false;
    void fetch("/api/cloud", { cache: "no-store" }).then(async (response) => {
      if (!response.ok || disposed) return;
      const result = await response.json() as { status?: CloudStatus };
      if (!disposed && result.status) setCloudStatus(result.status);
    }).catch(() => undefined);
    return () => { disposed = true; };
  }, [joined]);

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

  const clearChatImage = () => {
    setChatImage(null);
    setChatImagePreview("");
    if (chatImageInputRef.current) chatImageInputRef.current.value = "";
  };

  const selectChatImage = (file?: File) => {
    setChatImageError("");
    if (!file) return;
    setChatImage(file);
    setChatImagePreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : "");
  };

  const uploadChatFile = (file: File) => new Promise<ChatAttachment>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/chat/files");
    request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    request.setRequestHeader("X-File-Name", encodeURIComponent(file.name || "file"));
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) setChatUploadProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    });
    request.addEventListener("load", () => {
      const result = (() => { try { return JSON.parse(request.responseText) as { attachment?: unknown; error?: unknown; cloudWarning?: unknown }; } catch { return null; } })();
      const attachment = normalizeChatAttachment(result?.attachment);
      if (request.status >= 200 && request.status < 300 && attachment) {
        setChatUploadProgress(100);
        if (typeof result?.cloudWarning === "string") setChatImageError(result.cloudWarning);
        resolve(attachment);
      } else reject(new Error(typeof result?.error === "string" ? result.error : "附件上传失败，请重试"));
    });
    request.addEventListener("error", () => reject(new Error("附件上传失败，请检查网络后重试")));
    request.addEventListener("abort", () => reject(new Error("附件上传已中断")));
    request.send(file);
  });

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current === null) return;
    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };

  const startMessageLongPress = (event: React.PointerEvent, messageId: string) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if ((event.target as Element).closest("button")) return;
    clearLongPressTimer();
    longPressTriggeredRef.current = false;
    longPressOriginRef.current = { x: event.clientX, y: event.clientY };
    const messageTop = event.currentTarget.getBoundingClientRect().top;
    const listTop = messageListRef.current?.getBoundingClientRect().top || 0;
    const placement = messageTop - listTop > 145 ? "above" : "below";
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      setMessageMenuPlacement(placement);
      setMessageMenuId(messageId);
      longPressTimerRef.current = null;
    }, 520);
  };

  const moveMessageLongPress = (event: React.PointerEvent) => {
    if (Math.hypot(event.clientX - longPressOriginRef.current.x, event.clientY - longPressOriginRef.current.y) > 8) clearLongPressTimer();
  };

  const recallMessage = async (message: ChatMessage) => {
    if (!message.own) return;
    setMessageMenuId("");
    const response = await fetch(`/api/chat/messages/${encodeURIComponent(message.id)}`, { method: "DELETE" });
    if (!response.ok) {
      setChatImageError("撤回失败，请重试");
      return;
    }
    setMessages((current) => current.filter((item) => item.id !== message.id));
    if (chatQuote?.id === message.id) setChatQuote(null);
    void roomRef.current?.localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify({ type: "chat-recall", id: message.id })),
      { reliable: true },
    );
    dataConnectionsRef.current.forEach((connection) => {
      if (connection.open) connection.send({ type: "chat-recall", id: message.id });
    });
  };

  const quoteMessage = (message: ChatMessage) => {
    const attachmentLabel = message.attachment ? `[${message.attachment.kind === "image" ? "图片" : `文件：${message.attachment.name}`}]` : "[图片]";
    setChatQuote({ id: message.id, sender: message.sender, body: (message.body || attachmentLabel).slice(0, 160) });
    setMessageMenuId("");
  };

  const copyMessage = async (message: ChatMessage) => {
    const attachmentUrl = message.attachment?.url || message.imageUrl;
    const text = message.body || (attachmentUrl ? `${window.location.origin}${attachmentUrl}` : "");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("复制消息", text);
    }
    setMessageMenuId("");
  };

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    const body = chatDraft.trim();
    if ((!body && !chatImage) || chatSending) return;
    setChatSending(true);
    setChatImageError("");

    try {
      const attachment = chatImage ? await uploadChatFile(chatImage) : undefined;
      const id = crypto.randomUUID();
      const response = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, body, attachment, replyTo: chatQuote || undefined }),
      });
      const result = await response.json().catch(() => null) as { message?: unknown; error?: unknown } | null;
      const normalized = normalizeIncomingMessage(result?.message, identityIdRef.current);
      if (!response.ok || !normalized) throw new Error(typeof result?.error === "string" ? result.error : "消息发送失败，请重试");
      const message: ChatMessage = { ...normalized, own: true };
      setMessages((current) => [...current, message]);
      void roomRef.current?.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify({ ...message, type: "chat" })),
        { reliable: true },
      );
      dataConnectionsRef.current.forEach((connection) => {
        if (connection.open) connection.send({ ...message, type: "chat", sender: displayNameRef.current || displayName });
      });
      setChatDraft("");
      setChatQuote(null);
      clearChatImage();
    } catch (error) {
      setChatImageError(error instanceof Error ? error.message : "消息发送失败，请重试");
    } finally {
      setChatSending(false);
      setChatUploadProgress(null);
    }
  };

  const visibleTasks = tasks.filter((task) => !task.done);
  const visibleRemoteMembers = roomMembers;
  const groupedTaskMembers = new Map<string, string[]>();
  visibleRemoteMembers.forEach((peerId) => {
    if (!memberNames[peerId]) return;
    const identityKey = peerIdentityIds[peerId] || peerId;
    if (identityKey === identityId) return;
    groupedTaskMembers.set(identityKey, [...(groupedTaskMembers.get(identityKey) || []), peerId]);
  });
  const taskBoardGroups = [...groupedTaskMembers.entries()].map(([identityKey, peerIds]) => {
    const firstPeer = peerIds[0];
    const taskMap = new Map<string, SharedTask>();
    peerIds.flatMap((peerId) => memberTasks[peerId] || []).forEach((task) => taskMap.set(task.id, task));
    return {
      identityKey,
      nickname: memberNames[firstPeer] || "成员",
      tasks: [...taskMap.values()],
      activity: peerIds.map((peerId) => memberActivities[peerId]).find((value) => value?.trim()) || "...",
    };
  });
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
  const activeMedia = mediaItems.find((item) => item.id === activeMediaId) || mediaItems[0];
  const activeBoard = boards.find((board) => board.id === activeBoardId);

  const stepMedia = (direction: -1 | 1) => {
    if (mediaItems.length < 2) return;
    const currentIndex = Math.max(0, mediaItems.findIndex((item) => item.id === activeMedia?.id));
    const nextIndex = (currentIndex + direction + mediaItems.length) % mediaItems.length;
    setActiveMediaId(mediaItems[nextIndex].id);
  };

  return (
    <main className="app-shell" id="top" data-theme={appearanceTheme}>
      {backgroundImage && <div className="custom-background" style={{ backgroundImage: `url(${JSON.stringify(backgroundImage).slice(1, -1)})` }} aria-hidden="true" />}
      <header className="topbar">
        <div className="session-status"><span className="pulse" />一一主人专属</div>
        <div className="topbar-actions">
          <button className={cloudStatus?.warning ? "cloud-button warning" : "cloud-button"} type="button" onClick={openCloud} title={cloudStatus?.warning ? "云盘容量接近上限" : "打开云盘"}>
            <Cloud aria-hidden="true" />
            云盘
          </button>
          <button className="appearance-button" type="button" onClick={() => setAppearanceOpen(true)} title="外观设置"><Palette aria-hidden="true" />外观设置</button>
        </div>
      </header>

      <section className="workspace">
        <section className="focus-stage panel">
          <div className="participant-strip">
            <button
              className="participant-tile active selectable"
              type="button"
              onClick={() => { setActiveBoardId(""); setActiveMediaId(stream ? "self-screen" : cameraStream ? "self-camera" : ""); }}
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
                onClick={() => { setActiveBoardId(""); setActiveMediaId(remoteScreens[peerId] ? `${peerId}-screen` : remoteCameras[peerId] ? `${peerId}-camera` : ""); }}
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
            {boards.map((board) => (
              <div
                className={activeBoardId === board.id ? "participant-tile board-tile active selectable" : "participant-tile board-tile selectable"}
                role="button"
                tabIndex={0}
                key={board.id}
                onClick={() => { setActiveBoardId(board.id); setActiveMediaId(""); }}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActiveBoardId(board.id); setActiveMediaId(""); } }}
                aria-label={`查看${board.name}`}
              >
                <span className="tile-badge board">板</span>
                <div className="tile-preview board-preview" aria-hidden="true"><Presentation /></div>
                <small>{board.name}</small>
                <button className="board-delete" type="button" onClick={(event) => { event.stopPropagation(); deleteBoard(board.id); }} aria-label={`删除${board.name}`}>×</button>
              </div>
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
            {activeBoard ? <Whiteboard board={activeBoard} onAddStroke={(stroke, epoch) => addBoardStroke(activeBoard.id, stroke, epoch)} onDeleteStroke={(strokeId, epoch) => deleteBoardStroke(activeBoard.id, strokeId, epoch)} onClear={() => clearBoard(activeBoard.id)} onUpsertText={(text, epoch) => upsertBoardText(activeBoard.id, text, epoch)} onDeleteText={(textId, epoch) => deleteBoardText(activeBoard.id, textId, epoch)} onSaved={(message, error) => {
              setBoardNotice(error ? "" : message);
              setShareError(error ? message : "");
              if (!error) window.setTimeout(() => setBoardNotice((current) => current === message ? "" : current), 3500);
            }} /> : activeMedia ? <>
              <MediaVideo
                className={`main-media ${activeMedia.kind}${activeMedia.remote ? " remote" : ""}`}
                stream={activeMedia.stream}
                label={activeMedia.label}
                muted={!activeMedia.remote || activeMedia.kind !== "screen"}
              />
              {mediaItems.length > 1 && <>
                <button className="media-nav media-prev" type="button" onClick={() => stepMedia(-1)} aria-label="查看上一个画面">‹</button>
                <button className="media-nav media-next" type="button" onClick={() => stepMedia(1)} aria-label="查看下一个画面">›</button>
              </>}
              <div className="media-caption">{activeMedia.label}<span>{mediaItems.findIndex((item) => item.id === activeMedia.id) + 1} / {mediaItems.length}</span></div>
              {activeMedia.kind === "screen" && <div className="media-window-actions">
                {activeMedia.id === "self-screen" && <button className="share-mode-switch" type="button" onClick={() => openShareDialog("quality")} title="切换共享画面模式">{shareMode === "detail" ? "文字 / 代码" : "动态画面"}</button>}
                <button className={pictureInPicture ? "picture-in-picture-button active" : "picture-in-picture-button"} type="button" onClick={() => void togglePictureInPicture()} title={pictureInPicture ? "关闭小窗" : "开启小窗"}>{pictureInPicture ? "关闭小窗" : "小窗"}</button>
              </div>}
            </> : (
              <div className="empty-share">
                <div className="share-glyph"><span /><span /><span /></div>
                <button className="primary-button" onClick={() => openShareDialog("start")}>开始共享</button>
              </div>
            )}
          </div>
          {boardNotice && <p className="board-notice" role="status">{boardNotice}</p>}
          {(shareError || cameraError) && <p className="error-message" role="alert">{shareError || cameraError}</p>}
          <div className="room-controls">
            <button className={stream ? "share-on" : ""} disabled={shareStarting} onClick={() => stream ? stopShare() : openShareDialog("start")} aria-label={stream ? "结束共享" : "共享屏幕"} data-tooltip={stream ? "结束共享" : "共享屏幕"}>
              {stream ? <span className="room-stop-square" aria-hidden="true" /> : <MonitorUp className="room-control-icon" aria-hidden="true" />}
            </button>
            <button onClick={createBoard} aria-label="新建画板" data-tooltip="新建画板">
              <Presentation className="room-control-icon" aria-hidden="true" />
            </button>
            <button aria-label="麦克风" data-tooltip="麦克风">
              <MicOff className="room-control-icon" aria-hidden="true" />
            </button>
            <button className={cameraStream ? "camera-on" : ""} aria-label={cameraStream ? "关闭摄像头" : "开启摄像头"} data-tooltip={cameraStream ? "关闭摄像头" : "开启摄像头"} onClick={() => void toggleCamera()}>
              {cameraStream ? <CameraOff className="room-control-icon" aria-hidden="true" /> : <Camera className="room-control-icon" aria-hidden="true" />}
            </button>
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
            <div className="message-list" ref={messageListRef} onScroll={handleChatScroll} aria-live="polite">
              {chatHistoryLoading && <div className="chat-history-status">正在加载聊天记录…</div>}
              {!chatHistoryLoading && chatHistoryReady && !chatHistoryCursor && messages.length > 0 && <div className="chat-history-status">已经到最早一条了</div>}
              {messages.length === 0 ? <div className="empty-chat"><strong>还没有消息</strong></div> : messages.map((message) => (
                <div
                  className={message.own ? "message own" : "message"}
                  key={message.id}
                  onPointerDown={(event) => startMessageLongPress(event, message.id)}
                  onPointerMove={moveMessageLongPress}
                  onPointerUp={clearLongPressTimer}
                  onPointerCancel={clearLongPressTimer}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    clearLongPressTimer();
                    longPressTriggeredRef.current = false;
                    const listTop = messageListRef.current?.getBoundingClientRect().top || 0;
                    setMessageMenuPlacement(event.currentTarget.getBoundingClientRect().top - listTop > 145 ? "above" : "below");
                    setMessageMenuId(message.id);
                  }}
                  onClickCapture={(event) => {
                    if (!longPressTriggeredRef.current) return;
                    if ((event.target as Element).closest(".message-action-menu")) {
                      longPressTriggeredRef.current = false;
                      return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    longPressTriggeredRef.current = false;
                  }}
                >
                  <span>{message.sender} · {formatChatTime(message)}</span>
                  {messageMenuId === message.id && <div className={`message-action-menu ${messageMenuPlacement}${message.own ? " own" : ""}`} role="menu" onPointerDown={(event) => event.stopPropagation()}>
                    {message.own && <button type="button" role="menuitem" onClick={() => void recallMessage(message)}><span aria-hidden="true">↶</span>撤回</button>}
                    <button type="button" role="menuitem" onClick={() => quoteMessage(message)}><span className="message-action-icon-pink message-quote-icon" aria-hidden="true">“”</span>引用</button>
                    <button type="button" role="menuitem" onClick={() => void copyMessage(message)}><span className="message-action-icon-pink" aria-hidden="true">▣</span>复制</button>
                  </div>}
                  {message.replyTo && <div className="message-quote"><strong>{message.replyTo.sender}</strong><span>{message.replyTo.body}</span></div>}
                  {message.attachment?.kind === "image" && <div className="message-image-wrap">
                    <a className="message-image-link" href={message.attachment.url} target="_blank" rel="noreferrer" aria-label="查看原图">
                      <img className="message-image" src={message.attachment.url} alt={message.attachment.name} loading="lazy" onLoad={() => { if (chatAtBottomRef.current) scrollChatToBottom("auto"); }} />
                    </a>
                    <button className="image-cloud-button" type="button" onClick={() => void uploadChatImageToCloud(message.attachment!)} disabled={Boolean(chatCloudUploads[message.attachment.id])}>
                      {chatCloudUploads[message.attachment.id] === "done" ? "已上传" : chatCloudUploads[message.attachment.id] === "uploading" ? "上传中…" : "上传到云盘"}
                    </button>
                  </div>}
                  {message.attachment?.kind === "file" && <a className="message-file" href={message.attachment.url} download={message.attachment.name}>
                    <span className="message-file-icon" aria-hidden="true">↓</span>
                    <span><strong>{message.attachment.name}</strong><small>{formatFileSize(message.attachment.size)}</small></span>
                  </a>}
                  {message.imageUrl && <div className="message-image-wrap">
                    <a className="message-image-link" href={message.imageUrl} target="_blank" rel="noreferrer" aria-label="查看原图">
                      <img className="message-image" src={message.imageUrl} alt={`${message.sender} 发送的图片`} loading="lazy" onLoad={() => { if (chatAtBottomRef.current) scrollChatToBottom("auto"); }} />
                    </a>
                    {(() => { const id = message.imageUrl!.split("/").pop() || ""; return <button className="image-cloud-button" type="button" onClick={() => void uploadChatImageToCloud({ id, url: message.imageUrl!, name: "聊天图片", size: 0, mimeType: "image/*", kind: "image" })} disabled={Boolean(chatCloudUploads[id])}>{chatCloudUploads[id] === "done" ? "已上传" : chatCloudUploads[id] === "uploading" ? "上传中…" : "上传到云盘"}</button>; })()}
                  </div>}
                  {message.body && <p>{message.body}</p>}
                </div>
              ))}
            </div>
            <form className="chat-form" onSubmit={sendMessage}>
              {chatQuote && <div className="chat-quote-preview">
                <span><strong>回复 {chatQuote.sender}</strong>{chatQuote.body}</span>
                <button type="button" onClick={() => setChatQuote(null)} aria-label="取消引用">×</button>
              </div>}
              {chatImagePreview && <div className="chat-image-preview">
                <img src={chatImagePreview} alt="待发送图片预览" />
                <span>{chatImage?.name}</span>
                <button type="button" onClick={clearChatImage} aria-label="移除待发送附件">×</button>
              </div>}
              {chatImage && !chatImagePreview && <div className="chat-file-preview"><span aria-hidden="true">↧</span><div><strong>{chatImage.name}</strong><small>{formatFileSize(chatImage.size)}</small></div><button type="button" onClick={clearChatImage} aria-label="移除待发送附件">×</button></div>}
              <div className="chat-input-row">
                <input
                  ref={chatImageInputRef}
                  className="chat-image-input"
                  type="file"
                  onChange={(event) => {
                    selectChatImage(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                  tabIndex={-1}
                />
                <button className="chat-attach-button" type="button" onClick={() => chatImageInputRef.current?.click()} aria-label="发送图片或文件" title="发送图片或文件">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                </button>
                <textarea
                  value={chatDraft}
                  onChange={(event) => setChatDraft(event.target.value)}
                  onPaste={(event) => {
                    const file = Array.from(event.clipboardData.files)[0];
                    if (file) selectChatImage(file);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="输入消息"
                  aria-label="输入房间消息"
                  rows={2}
                />
                <button className="primary-button chat-send-button" type="submit" disabled={chatSending || (!chatDraft.trim() && !chatImage)}>{chatSending ? "发送中" : "发送"}</button>
              </div>
              {chatUploadProgress !== null && <div className="chat-upload-progress" role="status"><span style={{ width: `${chatUploadProgress}%` }} /><small>{chatUploadProgress < 100 ? `正在上传 ${chatUploadProgress}%` : "上传完成，正在发送…"}</small></div>}
              {chatImageError && <p className="chat-image-error" role="alert">{chatImageError}</p>}
            </form>
          </div> : <div className="task-view">
            <button
              className="task-range-switch"
              type="button"
              onClick={() => setTaskView((current) => current === "today" ? "week" : "today")}
              aria-label={`当前显示${taskView === "today" ? "今天" : "最近 7 天"}，点击切换到${taskView === "today" ? "最近 7 天" : "今天"}`}
            >
              <svg viewBox="0 0 28 34" aria-hidden="true"><path d="M7 3h14M9 6h10M14 7v5M7 13c1.5 4 2 8 2 14h10c0-6 .5-10 2-14M5 27h18" /></svg>
              <span>{taskView === "today" ? "今天" : "七天"}</span>
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
                      <div className="task-row" key={task.id}>
                        <button className="custom-check" type="button" onClick={(event) => { event.stopPropagation(); void toggleTask(task); }} aria-label={`完成任务：${task.title}`}>✓</button>
                        <span className="task-due">{formatDueDate(task.dueDate)}</span>
                        <span className="task-copy"><strong>{task.title}</strong></span>
                      </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              {taskBoardGroups.map((group) => {
                const { nickname, tasks: sharedTasks, activity: memberActivity } = group;
                return (
                  <section className="task-person-card" aria-label={`${nickname}的任务`} key={group.identityKey}>
                    <div className="activity-box readonly"><strong>{nickname}正在</strong><span className={memberActivity === "..." ? "empty-activity" : ""}>{memberActivity}</span></div>
                    <div className="task-person-list">
                      <div className="task-list">
                        {sharedTasks.map((task) => (
                      <div className="task-row readonly-task" key={task.id}>
                        <span className="custom-check" />
                        <span className="task-due">{formatDueDate(task.dueDate)}</span>
                        <span className="task-copy"><strong>{task.title}</strong></span>
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
            <h2 id="share-mode-title">{shareDialogAction === "start" ? "选择共享模式" : "切换画面模式"}</h2>
            {shareDialogAction === "start" && <p className="share-picker-note">选择模式后，浏览器会让你指定要共享的屏幕、窗口或标签页。</p>}
            {shareDialogAction === "start" && <label className="share-audio-option">
              <input type="checkbox" checked={shareComputerAudio} onChange={(event) => setShareComputerAudio(event.target.checked)} />
              <span><Volume2 aria-hidden="true" /><strong>同时共享电脑音频</strong><small>是否可用取决于浏览器和你选择的共享来源</small></span>
            </label>}
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

      {cloudOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setCloudOpen(false)}>
          <section className="cloud-modal" role="dialog" aria-modal="true" aria-labelledby="cloud-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setCloudOpen(false)} aria-label="关闭">×</button>
            <div className="cloud-heading">
              <div><span className="eyebrow">ROOM DRIVE</span><h2 id="cloud-title">云盘</h2></div>
              <div className={cloudStatus?.warning ? "cloud-meter warning" : "cloud-meter"}>
                <span><i style={{ width: `${cloudStatus?.percent || 0}%` }} /></span>
                <small>{cloudStatus ? `${formatFileSize(cloudStatus.usedBytes)} / ${formatFileSize(cloudStatus.limitBytes)}` : "正在读取容量…"}</small>
              </div>
            </div>
            {cloudStatus?.warning && <p className="cloud-capacity-warning">云盘已达到容量上限的 90%，新的自动保存和上传已暂停。</p>}
            <div className="cloud-toolbar">
              <button type="button" onClick={() => { const parts = cloudPath.split("/").filter(Boolean); parts.pop(); void loadCloudFolder(parts.join("/")); }} disabled={!cloudPath}>← 上一级</button>
              <strong>/{cloudPath}</strong>
              <button type="button" onClick={() => void createCloudFolder()}>新建文件夹</button>
              <button type="button" onClick={() => cloudInputRef.current?.click()} disabled={cloudUploading || cloudStatus?.warning}>上传文件</button>
              <input ref={cloudInputRef} type="file" className="chat-image-input" onChange={(event) => { void uploadCloudFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />
            </div>
            <div
              className={cloudUploading ? "cloud-dropzone uploading" : "cloud-dropzone"}
              onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
              onDrop={(event) => { event.preventDefault(); void uploadCloudFile(event.dataTransfer.files[0]); }}
            >
              {cloudLoading ? <div className="cloud-empty">正在加载…</div> : cloudItems.length ? cloudItems.map((item) => item.kind === "folder" ? (
                <button className="cloud-item folder" type="button" key={item.path} onClick={() => void loadCloudFolder(item.path)}>
                  <span aria-hidden="true">▰</span><strong>{item.name}</strong><small>文件夹</small>
                </button>
              ) : (
                <div className="cloud-item file" key={item.path}>
                  <span aria-hidden="true">▤</span><strong title={item.name}>{item.name}</strong><small>{formatFileSize(item.size)}</small>
                  <div><a href={`/api/cloud/files/${item.path.split("/").map(encodeURIComponent).join("/")}`} target="_blank" rel="noreferrer">查看</a><a href={`/api/cloud/files/${item.path.split("/").map(encodeURIComponent).join("/")}`} download={item.name}>下载</a></div>
                </div>
              )) : <div className="cloud-empty">把本地文件拖到这里上传</div>}
            </div>
            {(cloudError || cloudNotice) && <p className={cloudError ? "cloud-feedback error" : "cloud-feedback"} role="status">{cloudError || cloudNotice}</p>}
          </section>
        </div>
      )}

      {appearanceOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setAppearanceOpen(false)}>
          <section className="appearance-modal" role="dialog" aria-modal="true" aria-labelledby="appearance-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setAppearanceOpen(false)} aria-label="关闭">×</button>
            <h2 id="appearance-title">外观设置</h2>
            <p>选择统一强调色，或导入一张经过模糊和淡化处理的背景。</p>
            <div className="theme-options" aria-label="主题颜色">
              {(["pink", "blue", "green", "purple"] as const).map((theme) => (
                <button className={appearanceTheme === theme ? `theme-swatch ${theme} active` : `theme-swatch ${theme}`} type="button" onClick={() => chooseAppearanceTheme(theme)} key={theme} aria-label={`${theme}主题`} />
              ))}
            </div>
            <input ref={backgroundInputRef} className="chat-image-input" type="file" accept="image/*" onChange={(event) => { importBackground(event.target.files?.[0]); event.currentTarget.value = ""; }} />
            <div className="background-actions"><button className="primary-button" type="button" onClick={() => backgroundInputRef.current?.click()}>导入背景图片</button>{backgroundImage && <button type="button" onClick={clearBackground}>移除背景</button>}</div>
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
