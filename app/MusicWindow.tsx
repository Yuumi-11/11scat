"use client";
import { NeteaseMark } from "./NeteaseMark";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Headphones,
  MoreHorizontal,
  Minus,
  X,
  Play,
  Pause,
  ChevronUp,
} from "lucide-react";
import {
  musicStatus,
  visibleTrack,
  type MusicCommand,
  type MusicMember,
  type MusicSnapshot,
  type MusicTrack,
} from "./music-types";
import "./music-window.css";

type Point = { x: number; y: number };
type PanelProps = {
  data: MusicSnapshot | null;
  error: string;
  busy: boolean;
  onCommand: (command: MusicCommand) => Promise<void>;
  previewLabel?: string;
  initialOpen?: boolean;
  storageKey?: string;
};
function Avatar({ member }: { member?: MusicMember }) {
  return (
    <span
      className="music-avatar"
      title={member?.name || "对方"}
      aria-label={member?.name || "对方"}
    >
      {(member?.name || "·").slice(0, 1)}
    </span>
  );
}
function MusicCover({ cover }: { cover?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span className="music-cover">
      {cover && failed !== cover ? (
        <img
          src={cover}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailed(cover)}
        />
      ) : (
        <NeteaseMark />
      )}
    </span>
  );
}
function Song({ track }: { track?: MusicTrack }) {
  return (
    <>
      <MusicCover cover={track?.cover} />
      <span className="music-track-text">
        <strong title={track?.title}>{track?.title || "暂未播放"}</strong>
        <small title={track?.artist}>{track?.artist || "网易云音乐"}</small>
      </span>
    </>
  );
}
function Row({
  member,
  own,
  onConnect,
}: {
  member?: MusicMember;
  own?: boolean;
  onConnect: () => void;
}) {
  const track = visibleTrack(member, own);
  const status = musicStatus(member, own);
  return (
    <div className="music-row">
      <MusicCover
        cover={member?.state === "playing" ? track?.cover : undefined}
      />
      <div className="music-row-main">
        <div className="music-owner">
          <Avatar member={member} />
          <span>{own ? "我在听" : member?.name || "对方"}</span>
        </div>
        <strong title={track?.title || status}>{track?.title || status}</strong>
        <small title={track?.artist}>
          {track?.artist ||
            (own && !member?.connected ? (
              <button className="music-text-button" onClick={onConnect}>
                连接网易云
              </button>
            ) : (
              "网易云音乐"
            ))}
        </small>
      </div>
      {track && (
        <span className="music-play-state">
          {member?.state === "playing" ? (
            <span className="music-bars" aria-label="正在播放">
              <i />
              <i />
              <i />
            </span>
          ) : (
            "已暂停"
          )}
        </span>
      )}
    </div>
  );
}
function time(seconds = 0) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function MusicPanel({
  data,
  error,
  busy,
  onCommand,
  previewLabel,
  initialOpen = false,
  storageKey = "study-music-window",
}: PanelProps) {
  const [open, setOpen] = useState(initialOpen),
    [collapsed, setCollapsed] = useState(false),
    [menu, setMenu] = useState(false),
    [connect, setConnect] = useState(false);
  const [selected, setSelected] = useState("");
  const [position, setPosition] = useState<Point | null>(null);
  const panel = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    drag = useRef<{ pointer: number; start: Point; origin: Point } | null>(
      null,
    );
  const self = data?.members.find((m) => m.id === data.selfId),
    peers = data?.members.filter((m) => m.id !== data.selfId) || [];
  const peer = peers.find((m) => m.id === selected) || peers[0];
  const invite =
    data?.invitation?.mode === "sync" ? data.invitation : undefined;
  const inviter = data?.members.find((m) => m.id === invite?.from);
  const leader = data?.members.find(
    (m) => m.id === (data.session?.leader || invite?.leader),
  );
  const together =
    data?.capabilities.sync === true && data.session?.verified === true
      ? data.session
      : undefined;
  const peerTrack = visibleTrack(peer),
    selfTrack = visibleTrack(self, true);
  const key = `${storageKey}:${data?.selfId || "loading"}`;
  const loadedKey = useRef("");
  const clamp = useCallback((point: Point): Point => {
    const rect = panel.current?.getBoundingClientRect();
    return {
      x: Math.max(
        12,
        Math.min(point.x, window.innerWidth - (rect?.width || 400) - 12),
      ),
      y: Math.max(
        12,
        Math.min(point.y, window.innerHeight - (rect?.height || 300) - 12),
      ),
    };
  }, []);
  useEffect(() => {
    if (!data?.selfId) return;
    const frame = requestAnimationFrame(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(key) || "null");
        if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y))
          setPosition(clamp({ x: saved.x, y: saved.y }));
      } catch {}
      loadedKey.current = key;
    });
    return () => cancelAnimationFrame(frame);
  }, [data?.selfId, key, clamp]);
  useEffect(() => {
    if (!open) return;
    const fit = () =>
      setPosition((p) => {
        const anchor =
          document
            .querySelector(".participant-strip")
            ?.getBoundingClientRect() ||
          trigger.current?.getBoundingClientRect();
        const next = clamp(
          p || { x: anchor?.left || 16, y: (anchor?.bottom || 70) + 10 },
        );
        return p?.x === next.x && p.y === next.y ? p : next;
      });
    fit();
    const observer = new ResizeObserver(fit);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener("resize", fit);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [open, collapsed, connect, menu, clamp]);
  useEffect(() => {
    if (position && data?.selfId && loadedKey.current === key) {
      try {
        localStorage.setItem(key, JSON.stringify(position));
      } catch {}
    }
  }, [position, key, data?.selfId]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as Element).closest(".music-more")) setMenu(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menu]);
  function beginDrag(e: React.PointerEvent) {
    if (
      e.button !== 0 ||
      (e.target as Element).closest("button,a,input,select")
    )
      return;
    const rect = panel.current!.getBoundingClientRect();
    drag.current = {
      pointer: e.pointerId,
      start: { x: e.clientX, y: e.clientY },
      origin: { x: rect.left, y: rect.top },
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function moveDrag(e: React.PointerEvent) {
    if (e.buttons !== 1) {
      drag.current = null;
      return;
    }
    const d = drag.current;
    if (d?.pointer === e.pointerId)
      setPosition(
        clamp({
          x: d.origin.x + e.clientX - d.start.x,
          y: d.origin.y + e.clientY - d.start.y,
        }),
      );
  }
  async function command(c: MusicCommand) {
    try {
      await onCommand(c);
      setMenu(false);
    } catch {
      /* Parent keeps the actionable error visible. */
    }
  }
  function close() {
    setOpen(false);
    setMenu(false);
    trigger.current?.focus();
  }
  const pendingReceived =
    invite?.status === "pending" && invite.to === data?.selfId;
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="cloud-button music-entry"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="room-music-window"
      >
        <Headphones size={17} />
        <span>音乐</span>
        {pendingReceived && (
          <span className="music-notice" aria-label="收到音乐邀请" />
        )}
      </button>
      {open && (
        <div
          ref={panel}
          id="room-music-window"
          role="dialog"
          aria-modal="false"
          aria-label="音乐"
          className={`music-window${collapsed ? " is-collapsed" : ""}`}
          style={{ left: position?.x ?? 16, top: position?.y ?? 90 }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              if (menu) setMenu(false);
              else if (connect) {
                setConnect(false);
              } else close();
            }
          }}
        >
          <div
            className="music-titlebar"
            onPointerDown={beginDrag}
            onPointerMove={moveDrag}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            onLostPointerCapture={() => {
              drag.current = null;
            }}
            tabIndex={0}
            aria-label="音乐窗口标题栏，可拖动或用方向键移动"
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              const shifts: Record<string, Point> = {
                ArrowLeft: { x: -16, y: 0 },
                ArrowRight: { x: 16, y: 0 },
                ArrowUp: { x: 0, y: -16 },
                ArrowDown: { x: 0, y: 16 },
              };
              if (shifts[e.key]) {
                e.preventDefault();
                const r = panel.current!.getBoundingClientRect();
                setPosition(
                  clamp({
                    x: r.left + shifts[e.key].x,
                    y: r.top + shifts[e.key].y,
                  }),
                );
              }
            }}
          >
            <strong>
              <Headphones size={16} />
              音乐{" "}
              <span className="music-source" title="网易云音乐">
                云
              </span>
            </strong>
            <div className="music-window-tools">
              <div className="music-more">
                <button
                  aria-label="音乐更多选项"
                  aria-expanded={menu}
                  onClick={() => {
                    setMenu(!menu);
                    if (collapsed) setCollapsed(false);
                  }}
                >
                  <MoreHorizontal size={18} />
                </button>
                {menu && (
                  <div className="music-menu">
                    <button
                      onClick={() => {
                        setConnect(true);
                        setCollapsed(false);
                        setMenu(false);
                      }}
                    >
                      连接网易云
                    </button>
                    <label>
                      <input
                        type="checkbox"
                        checked={data?.sharing || false}
                        disabled={!data || busy}
                        onChange={(e) =>
                          void command({
                            action: "sharing",
                            enabled: e.target.checked,
                          })
                        }
                      />
                      共享我的听歌状态
                    </label>
                    <p>仅开启共享不会加入一起听。</p>
                    {(invite || together) && (
                      <button
                        disabled={busy}
                        onClick={() => void command({ action: "end" })}
                      >
                        {together ? "结束一起听" : "结束本次邀请"}
                      </button>
                    )}
                  </div>
                )}
              </div>
              <button
                aria-label={collapsed ? "展开音乐" : "收起音乐"}
                onClick={() => {
                  setCollapsed(!collapsed);
                  setMenu(false);
                }}
              >
                {collapsed ? <ChevronUp size={17} /> : <Minus size={17} />}
              </button>
              <button aria-label="关闭音乐" onClick={close}>
                <X size={17} />
              </button>
            </div>
          </div>
          {previewLabel && (
            <div className="music-preview-label">{previewLabel}</div>
          )}
          {collapsed ? (
            <div className="music-summary">
              <button
                className="music-summary-body"
                aria-label="展开音乐小窗"
                onClick={() => setCollapsed(false)}
              >
                {together ? (
                  <>
                    <span className="music-avatar-pair">
                      <Avatar member={self} />
                      <Avatar member={peer} />
                    </span>
                    <span>
                      <strong title={together.track.title}>
                        {together.track.title}
                      </strong>
                      <small>正在一起听</small>
                    </span>
                  </>
                ) : (
                  <>
                    {[self, peer].map((member, index) => (
                      <span className="music-summary-row" key={index}>
                        <Avatar member={member} />
                        <span title={visibleTrack(member, index === 0)?.title}>
                          {visibleTrack(member, index === 0)?.title ||
                            musicStatus(member, index === 0)}
                        </span>
                      </span>
                    ))}
                  </>
                )}
              </button>
              {together?.canControl && (
                <button
                  className="music-summary-toggle"
                  aria-label={
                    together.playing ? "暂停共同播放" : "继续共同播放"
                  }
                  disabled={busy}
                  onClick={() =>
                    void command({
                      action: together.playing ? "pause" : "play",
                    })
                  }
                >
                  {together.playing ? <Pause size={17} /> : <Play size={17} />}
                </button>
              )}
              {pendingReceived && (
                <button
                  className="music-text-button"
                  onClick={() => setCollapsed(false)}
                >
                  收到 {inviter?.name} 的邀请
                </button>
              )}
            </div>
          ) : (
            <div className="music-body">
              {!data ? (
                <p className="music-empty" role="status">
                  {error || "正在读取音乐状态…"}
                </p>
              ) : (
                <>
                  {peers.length > 1 && (
                    <label className="music-peer-select">
                      与谁听
                      <select
                        value={peer?.id || ""}
                        onChange={(e) => setSelected(e.target.value)}
                      >
                        {peers.map((p) => (
                          <option value={p.id} key={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {together ? (
                    <section className="music-together">
                      <div className="music-together-heading">
                        <span className="music-avatar-pair">
                          <Avatar member={self} />
                          <Avatar member={peer} />
                        </span>
                        <span>正在一起听</span>
                        <span
                          className="music-bars"
                          aria-label={together.playing ? "正在播放" : "已暂停"}
                        >
                          <i />
                          <i />
                          <i />
                        </span>
                      </div>
                      <div className="music-common-song">
                        <Song track={together.track} />
                      </div>
                      <div className="music-progress">
                        <progress
                          aria-label="共同歌曲进度"
                          max={together.track.duration || 1}
                          value={together.track.position || 0}
                        />
                        <span>
                          {time(together.track.position)}
                          <span>{time(together.track.duration)}</span>
                        </span>
                      </div>
                      <div className="music-common-controls">
                        <small>
                          {together.leader === data.selfId
                            ? "由你选歌"
                            : `跟随 ${leader?.name || "TA"} 播放`}
                        </small>
                        {together.canControl ? (
                          <button
                            className="music-round-play"
                            disabled={busy}
                            aria-label={
                              together.playing ? "暂停共同播放" : "继续共同播放"
                            }
                            onClick={() =>
                              void command({
                                action: together.playing ? "pause" : "play",
                              })
                            }
                          >
                            {together.playing ? (
                              <Pause size={18} />
                            ) : (
                              <Play size={18} />
                            )}
                          </button>
                        ) : (
                          <small>播放控制由对方操作</small>
                        )}
                      </div>
                      <button
                        className="music-text-button music-end"
                        disabled={busy}
                        onClick={() => void command({ action: "end" })}
                      >
                        结束一起听
                      </button>
                    </section>
                  ) : (
                    <div className="music-rows">
                      <Row
                        member={self}
                        own
                        onConnect={() => setConnect(true)}
                      />
                      <Row member={peer} onConnect={() => setConnect(true)} />
                    </div>
                  )}
                  {connect && (
                    <section className="music-connection">
                      <div>
                        <strong>连接网易云</strong>
                        <button
                          aria-label="收起连接说明"
                          onClick={() => setConnect(false)}
                        >
                          <X size={15} />
                        </button>
                      </div>
                      <p>
                        同步桌面网易云需要双方各自连接客户端。当前尚未接通，暂时无法读取播放列表、歌曲或进度。
                      </p>
                      <p>
                        连接后，由你决定是否共享听歌状态；一起听邀请需要另行确认。
                      </p>
                    </section>
                  )}
                  {!together && (
                    <div className="music-footer">
                      {invite?.status === "pending" ? (
                        pendingReceived ? (
                          <section className="music-invitation">
                            <strong>
                              {inviter?.name || "TA"} 邀请你一起听
                            </strong>
                            <span title={invite.title}>{invite.title}</span>
                            <p>
                              {`接受后跟随 ${leader?.name || "TA"} 播放，替换当前播放队列并切换至这首歌。`}
                            </p>
                            <div className="music-invite-actions">
                              <button
                                className="music-primary"
                                disabled={busy}
                                onClick={() =>
                                  void command({
                                    action: "accept",
                                    id: invite.id,
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
                                    id: invite.id,
                                  })
                                }
                              >
                                拒绝
                              </button>
                            </div>
                          </section>
                        ) : (
                          <section className="music-waiting" role="status">
                            <strong>
                              等待{" "}
                              {data.members.find((m) => m.id === invite.to)
                                ?.name || "TA"}{" "}
                              同意
                            </strong>
                            <small title={invite.title}>{invite.title}</small>
                            <button
                              className="music-text-button"
                              disabled={busy}
                              onClick={() =>
                                void command({
                                  action: "cancel",
                                  id: invite.id,
                                })
                              }
                            >
                              取消邀请
                            </button>
                          </section>
                        )
                      ) : invite?.status === "accepted" ? (
                        <section className="music-external">
                          <strong>邀请已接受</strong>
                          <p>正在等待双方客户端确认同步。</p>
                          <button
                            className="music-text-button"
                            disabled={busy}
                            onClick={() => void command({ action: "end" })}
                          >
                            结束本次邀请
                          </button>
                        </section>
                      ) : (
                        <>
                          <button
                            className="music-primary"
                            disabled={
                              !peerTrack || !data.capabilities.sync || busy
                            }
                            onClick={() => {
                              if (peerTrack)
                                void command({
                                  action: "invite",
                                  to: peer!.id,
                                  leader: peer!.id,
                                  title: peerTrack.title,
                                  url: peerTrack.url || "",
                                });
                            }}
                          >
                            跟 TA 一起听
                          </button>
                          <button
                            className="music-text-button music-invite-own"
                            disabled={
                              !peer ||
                              !selfTrack ||
                              !data.capabilities.sync ||
                              busy
                            }
                            onClick={() => {
                              if (peer && selfTrack)
                                void command({
                                  action: "invite",
                                  to: peer.id,
                                  leader: data.selfId,
                                  title: selfTrack.title,
                                  url: selfTrack.url || "",
                                });
                            }}
                          >
                            邀请 TA 听我的
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
              {error && data && (
                <p className="music-error" role="alert">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

export function MusicWindow() {
  const [data, setData] = useState<MusicSnapshot | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const generation = useRef(0),
    mutating = useRef(false);
  useEffect(() => {
    let stopped = false;
    let timeout: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const read = async () => {
      if (document.visibilityState === "visible" && !mutating.current) {
        const version = ++generation.current;
        try {
          const response = await fetch("/api/room/music", {
            cache: "no-store",
            signal: controller.signal,
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || "音乐状态暂不可用");
          if (!stopped && version === generation.current) {
            setData(body);
            setError("");
          }
        } catch {
          if (!stopped && version === generation.current) {
            setError("音乐状态暂不可用，请稍后重试");
            setData((current) =>
              current
                ? {
                    ...current,
                    session: undefined,
                    members: current.members.map((m) => ({
                      ...m,
                      state: "unavailable",
                      track: undefined,
                    })),
                  }
                : null,
            );
          }
        }
      }
      if (!stopped) timeout = setTimeout(read, 6000);
    };
    void read();
    return () => {
      stopped = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);
  const command = async (command: MusicCommand) => {
    if (mutating.current) return;
    mutating.current = true;
    ++generation.current;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/room/music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "操作未完成");
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作未完成，请重试");
      throw e;
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  };
  return (
    <MusicPanel data={data} busy={busy} error={error} onCommand={command} />
  );
}
