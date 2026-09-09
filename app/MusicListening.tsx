"use client";
import { NeteaseMark } from "./NeteaseMark";
import { useCallback, useEffect, useRef, useState } from "react";
import { Headphones, Minus, MoreHorizontal, X } from "lucide-react";
import { createPortal } from "react-dom";
import {
  connectLocalMusic,
  joinMusicAudio,
  type LocalMusic,
} from "./music-audio";
import type {
  ListenerMember,
  ListenInvite,
} from "./api/room/music/listen/state";
import "./music-window.css";
type Snapshot = {
  selfId: string;
  members: ListenerMember[];
  invitation?: ListenInvite;
};
const endpoint = "/api/room/music/listen";
function Mark() {
  return (
    <span className="music-cover">
      <NeteaseMark />
    </span>
  );
}
export function MusicListening() {
  const [diagnostics, setDiagnostics] = useState("");
  const [data, setData] = useState<Snapshot | null>(null),
    [open, setOpen] = useState(false),
    [collapsed, setCollapsed] = useState(false),
    [menu, setMenu] = useState(false),
    [connecting, setConnecting] = useState(false),
    [connected, setConnected] = useState(false),
    [sharing, setSharing] = useState(false),
    [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [delivered, setDelivered] = useState(false),
    [volume, setVolume] = useState(0.8),
    [position, setPosition] = useState({ x: 24, y: 104 });
  const local = useRef<LocalMusic | null>(null),
    room = useRef<RTCPeerConnection | null>(null),
    audio = useRef<HTMLAudioElement | null>(null),
    state = useRef({
      connected: false,
      sharing: false,
      id: "",
      receiving: false,
    }),
    device = useRef(""),
    panel = useRef<HTMLDivElement>(null),
    drag = useRef<{ x: number; y: number; left: number; top: number } | null>(
      null,
    ),
    generation = useRef(0),
    alive = useRef(true),
    starting = useRef(false);
  const invitation = data?.invitation,
    self = data?.members.find((m) => m.id === data.selfId),
    peer = data?.members.find((m) => m.id !== data.selfId),
    leader = data?.members.find((m) => m.id === invitation?.leader);
  const isLeader = invitation?.leader === data?.selfId;
  useEffect(() => {
    state.current = {
      connected,
      sharing,
      id: invitation?.id || "",
      receiving: delivered,
    };
  }, [connected, sharing, invitation?.id, delivered]);
  const stopTransport = useCallback(() => {
    const current = room.current;
    room.current = null;
    if (current) {
      current.onconnectionstatechange = null;
      current.ontrack = null;
      current.close();
    }
    if (audio.current) {
      audio.current.pause();
      audio.current.srcObject = null;
    }
    setDelivered(false);
  }, []);
  const request = useCallback(
    async (body: Record<string, unknown>, update = true) => {
      const version = generation.current;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "音乐操作失败");
      if (update && alive.current && version === generation.current)
        setData(result);
      return result;
    },
    [],
  );
  useEffect(() => {
    alive.current = true;
    device.current = crypto.randomUUID();
    audio.current = new Audio();
    audio.current.autoplay = true;
    audio.current.volume = 0.8;
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const version = generation.current;
      try {
        const s = state.current;
        const result = await request(
          {
            action: "heartbeat",
            device: device.current,
            connected: s.connected,
            sharing: s.sharing,
            id: s.id,
            receiving: s.receiving,
          },
          false,
        );
        if (!stopped && version === generation.current) {
          setData(result);
          setError((current) =>
            current === "音乐服务暂不可用" ? "" : current,
          );
        }
      } catch {
        if (!stopped) {
          setError("音乐服务暂不可用");
          stopTransport();
        }
      }
      if (!stopped) timer = setTimeout(poll, 4000);
    };
    void poll();
    return () => {
      stopped = true;
      alive.current = false;
      clearTimeout(timer);
      local.current?.close();
      local.current = null;
      stopTransport();
    };
  }, [request, stopTransport]);
  const fit = useCallback(
    (point: { x: number; y: number }) => ({
      x: Math.max(
        12,
        Math.min(
          point.x,
          innerWidth -
            (panel.current?.offsetWidth || Math.min(400, innerWidth - 24)) -
            12,
        ),
      ),
      y: Math.max(
        12,
        Math.min(
          point.y,
          innerHeight - (panel.current?.offsetHeight || 300) - 12,
        ),
      ),
    }),
    [],
  );
  useEffect(() => {
    if (!data?.selfId) return;
    try {
      const saved = JSON.parse(
        localStorage.getItem(`music-audio-position:${data.selfId}`) || "null",
      );
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y))
        requestAnimationFrame(() => setPosition(fit(saved)));
    } catch {}
  }, [data?.selfId, fit]);
  useEffect(() => {
    if (!open) return;
    const adjust = () => setPosition((p) => fit(p));
    const frame = requestAnimationFrame(adjust);
    const resize = new ResizeObserver(adjust);
    if (panel.current) resize.observe(panel.current);
    window.addEventListener("resize", adjust);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener("resize", adjust);
    };
  }, [open, collapsed, fit]);
  useEffect(() => {
    if (invitation?.status !== "accepted") {
      const frame = requestAnimationFrame(stopTransport);
      return () => cancelAnimationFrame(frame);
    }
  }, [invitation?.id, invitation?.status, stopTransport]);
  async function command(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    generation.current++;
    try {
      await request(body);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function connect() {
    if (connecting) return;
    setConnecting(true);
    setError("");
    try {
      local.current?.close();
      local.current = await connectLocalMusic(code, (message) => {
        local.current = null;
        setConnected(false);
        setSharing(false);
        stopTransport();
        setError(message);
      });
      setConnected(true);
      setCode("");
      setMenu(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConnecting(false);
    }
  }
  async function start() {
    if (
      !invitation ||
      invitation.status !== "accepted" ||
      starting.current ||
      room.current
    )
      return;
    starting.current = true;
    setError("");
    setDelivered(false);
    const id = invitation.id;
    const next = new RTCPeerConnection({
      iceTransportPolicy:
        process.env.NODE_ENV === "development" &&
        process.env.NEXT_PUBLIC_MUSIC_FORCE_RELAY === "true"
          ? "relay"
          : "all",
    });
    room.current = next;
    try {
      const transport = await fetch("/api/realtime-config").then((r) => {
        if (!r.ok) throw Error("无法取得音乐网络配置");
        return r.json();
      });
      next.setConfiguration({ iceServers: transport.iceServers });
      if (room.current !== next) return;
      await joinMusicAudio({
        room: next,
        diagnostics:
          process.env.NODE_ENV === "development"
            ? (samples, relay) =>
                setDiagnostics(
                  `已接收 ${samples} 个音频样本 · ${relay ? "TURN 中继" : "直接连接"}`,
                )
            : undefined,
        signal: async (kind, sdp) => {
          await request({ action: "signal", id, kind, sdp }, false);
        },
        readSignal: async () => {
          const response = await fetch(endpoint, {
            cache: "no-store",
            signal: AbortSignal.timeout(8000),
          });
          if (!response.ok) throw Error("音乐服务不可用");
          const snapshot = await response.json();
          if (
            snapshot.invitation?.id !== id ||
            snapshot.invitation?.status !== "accepted"
          )
            throw Error("邀请已结束");
          return snapshot.invitation.signal;
        },
        leader: !!isLeader,
        track: local.current?.track,
        audio: audio.current!,
        ready: () => {
          if (room.current === next) {
            setDelivered(true);
            setError("");
            void request({ action: "ready", id }).catch(() => {
              stopTransport();
              setError("分享已结束");
            });
          }
        },
        error: (message) => {
          if (room.current === next) {
            setDelivered(false);
            setError(message);
          }
        },
      });
    } catch (e) {
      if (room.current === next) {
        stopTransport();
        setError((e as Error).message);
      }
    } finally {
      starting.current = false;
    }
  }
  // The sender has already consented through invitation/acceptance. No music is published before that point.
  useEffect(() => {
    if (invitation?.status === "accepted" && isLeader && connected)
      void start();
  }, [invitation?.id, invitation?.status, isLeader, connected]); // eslint-disable-line react-hooks/exhaustive-deps
  const together =
    invitation?.status === "accepted" &&
    delivered &&
    invitation.ready.length === 2;
  const title = (m?: ListenerMember) =>
    !m
      ? "对方尚未加入"
      : m.id === data?.selfId
        ? connected
          ? "网易云已连接"
          : "连接桌面网易云"
        : !m.sharing
          ? "未共享听歌状态"
          : m.connected
            ? "可请求收听"
            : "状态暂不可用";
  return (
    <>
      <button
        type="button"
        className="cloud-button music-entry"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          setCollapsed(false);
        }}
      >
        <Headphones aria-hidden="true" />
        音乐
        {invitation?.status === "pending" && <span className="music-notice" />}
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            className="music-window"
            style={{
              position: "fixed",
              zIndex: 95,
              left: position.x,
              top: position.y,
              width: collapsed ? 300 : 400,
            }}
            role="region"
            aria-label="音乐小窗"
          >
            <div
              className="music-titlebar"
              tabIndex={0}
              aria-label="音乐窗口标题栏，可拖动"
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest("button,input,a")) return;
                drag.current = {
                  x: e.clientX,
                  y: e.clientY,
                  left: position.x,
                  top: position.y,
                };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (d && e.buttons === 1)
                  setPosition(
                    fit({
                      x: d.left + e.clientX - d.x,
                      y: d.top + e.clientY - d.y,
                    }),
                  );
              }}
              onPointerUp={() => {
                drag.current = null;
                if (data)
                  localStorage.setItem(
                    `music-audio-position:${data.selfId}`,
                    JSON.stringify(position),
                  );
              }}
              onLostPointerCapture={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
            >
              <span>
                <Headphones size={17} /> 音乐
              </span>
              <div className="music-window-tools">
                <button
                  aria-label="音乐更多选项"
                  onClick={() => setMenu((v) => !v)}
                >
                  <MoreHorizontal size={18} />
                </button>
                <button
                  aria-label={collapsed ? "展开音乐" : "收起音乐"}
                  onClick={() => setCollapsed((v) => !v)}
                >
                  <Minus size={18} />
                </button>
                <button aria-label="关闭音乐" onClick={() => setOpen(false)}>
                  <X size={18} />
                </button>
              </div>
            </div>
            {collapsed ? (
              <button
                className="music-summary"
                onClick={() => setCollapsed(false)}
              >
                {together ? (
                  <span>
                    {self?.name} · {peer?.name}
                    <br />
                    正在一起听 · {leader?.name} 的网易云
                  </span>
                ) : (
                  <span>
                    {self?.name || "我"} · {title(self)}
                    <br />
                    {peer?.name || "对方"} · {title(peer)}
                  </span>
                )}
              </button>
            ) : (
              <div className="music-body">
                {process.env.NODE_ENV === "development" && (
                  <small>
                    本机双身份验收 · 真实音频，测试昵称
                    <br />
                    {diagnostics}
                  </small>
                )}
                {menu && (
                  <section className="music-connection">
                    <strong>连接桌面网易云</strong>
                    <p>
                      分享方运行 Windows
                      连接程序，将配对码粘贴到这里。只连接网易云声音，不读取账号或保存录音。
                    </p>
                    <a href="/music/11scat-Music.zip" download>
                      下载 Windows 连接程序
                    </a>{" "}
                    <a href="/music/11scat-Music.zip.sha256" download>
                      校验值
                    </a>
                    <input
                      aria-label="音乐配对码"
                      type="password"
                      autoComplete="off"
                      value={code}
                      onChange={(e) => setCode(e.target.value.trim())}
                      placeholder="连接程序中的配对码"
                    />
                    <button
                      className="music-primary"
                      disabled={connecting || connected}
                      onClick={() => void connect()}
                    >
                      {connecting ? "连接中…" : "连接本机网易云"}
                    </button>
                    {connected && (
                      <button
                        className="music-text-button"
                        onClick={() => {
                          local.current?.close();
                          local.current = null;
                          setConnected(false);
                          setSharing(false);
                          stopTransport();
                          if (invitation)
                            void command({ action: "end", id: invitation.id });
                        }}
                      >
                        断开本机连接
                      </button>
                    )}
                  </section>
                )}
                {together ? (
                  <section className="music-together">
                    <p>
                      {self?.name} · {peer?.name}　正在一起听
                    </p>
                    <div className="music-row">
                      <Mark />
                      <div className="music-row-main">
                        <strong>{leader?.name} 的网易云音乐</strong>
                        <small>歌曲信息暂不可用</small>
                      </div>
                    </div>
                    <p>
                      {isLeader
                        ? "由你在网易云选歌、暂停"
                        : "正在收听对方分享的音乐"}
                    </p>
                  </section>
                ) : (
                  <div>
                    {[self, peer].map((m, i) => (
                      <div className="music-row" key={i}>
                        <Mark />
                        <div className="music-row-main">
                          <span className="music-owner">
                            {i === 0 ? "我" : m?.name || "对方"}
                          </span>
                          <strong>{title(m)}</strong>
                          <small>
                            {i === 0 && !connected ? (
                              <button
                                className="music-text-button"
                                onClick={() => setMenu(true)}
                              >
                                连接网易云
                              </button>
                            ) : (
                              "歌曲信息暂不可用"
                            )}
                          </small>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {connected && (
                  <label className="music-share-consent">
                    <input
                      type="checkbox"
                      checked={sharing}
                      onChange={async (e) => {
                        const enabled = e.target.checked;
                        setSharing(enabled);
                        if (!enabled) {
                          stopTransport();
                          if (invitation)
                            await command({ action: "end", id: invitation.id });
                        }
                        await command({
                          action: "heartbeat",
                          device: device.current,
                          connected: true,
                          sharing: enabled,
                        });
                      }}
                    />
                    允许对方请求收听，接受邀请后才传送声音
                  </label>
                )}
                <div className="music-footer">
                  {!invitation ? (
                    <>
                      <button
                        className="music-primary"
                        disabled={busy || !peer?.sharing || !peer.connected}
                        onClick={() =>
                          void command({
                            action: "invite",
                            to: peer!.id,
                            leader: peer!.id,
                          })
                        }
                      >
                        跟 TA 一起听
                      </button>
                      <button
                        className="music-text-button music-invite-own"
                        disabled={busy || !connected || !sharing || !peer}
                        onClick={() =>
                          void command({
                            action: "invite",
                            to: peer!.id,
                            leader: data!.selfId,
                          })
                        }
                      >
                        邀请 TA 听我的
                      </button>
                    </>
                  ) : invitation.status === "pending" ? (
                    invitation.to === data?.selfId ? (
                      <section className="music-invitation">
                        <strong>
                          {
                            data.members.find((m) => m.id === invitation.from)
                              ?.name
                          }{" "}
                          {isLeader ? "想听你的音乐" : "邀请你一起听"}
                        </strong>
                        <p>
                          接受后
                          {isLeader
                            ? "分享你网易云的声音"
                            : "通过网站收听对方的音乐"}
                          ，保留各自的网易云播放列表。
                        </p>
                        <div className="music-invite-actions">
                          <button
                            className="music-primary"
                            disabled={busy}
                            onClick={() =>
                              void command({
                                action: "accept",
                                id: invitation.id,
                              })
                            }
                          >
                            接受邀请
                          </button>
                          <button
                            className="music-secondary"
                            disabled={busy}
                            onClick={() =>
                              void command({
                                action: "decline",
                                id: invitation.id,
                              })
                            }
                          >
                            拒绝
                          </button>
                        </div>
                      </section>
                    ) : (
                      <section className="music-waiting">
                        <strong>等待 TA 同意</strong>
                        <button
                          className="music-text-button"
                          onClick={() =>
                            void command({
                              action: "cancel",
                              id: invitation.id,
                            })
                          }
                        >
                          取消邀请
                        </button>
                      </section>
                    )
                  ) : (
                    <>
                      {!together && (
                        <p role="status">
                          {delivered
                            ? "等待对方接通音乐"
                            : isLeader
                              ? "正在建立音乐传输"
                              : "邀请已接受，点击开始收听"}
                        </p>
                      )}
                      {!isLeader && !delivered && (
                        <button
                          className="music-primary"
                          onClick={async () => {
                            if (room.current) {
                              try {
                                await audio.current?.play();
                                stopTransport();
                              } catch {}
                            }
                            await start();
                          }}
                        >
                          开始收听
                        </button>
                      )}
                      {!isLeader && (
                        <label className="music-volume">
                          收听音量
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            aria-label="收听音量"
                            value={volume}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setVolume(v);
                              if (audio.current) audio.current.volume = v;
                            }}
                          />
                        </label>
                      )}
                      <button
                        className="music-text-button"
                        onClick={() => {
                          stopTransport();
                          void command({ action: "end", id: invitation.id });
                        }}
                      >
                        结束一起听
                      </button>
                    </>
                  )}
                </div>
                {error && (
                  <p className="music-error" role="alert">
                    {error}
                  </p>
                )}
              </div>
            )}
          </div>,
          document.querySelector(".app-shell") || document.body,
        )}
    </>
  );
}
