"use client";
import { useState } from "react";
import { MusicPanel } from "../MusicWindow";
import type { MusicCommand, MusicSnapshot } from "../music-types";
const cover = (color: string, ink: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="${color}"/><circle cx="68" cy="28" r="17" fill="${ink}"/><path d="M0 74L30 46L62 71L96 48V96H0Z" fill="${ink}" opacity=".65"/><path d="M13 20h22M13 25h15" stroke="white" opacity=".7"/></svg>`)}`;
const original: MusicSnapshot = {
  selfId: "a",
  sharing: true,
  capabilities: { liveStatus: true, sync: true },
  members: [
    {
      id: "a",
      name: "小蓝",
      connected: true,
      sharing: true,
      online: true,
      state: "playing",
      track: {
        title: "夜航 · 到月亮升起的地方",
        artist: "示例歌手 / 夜航日记",
        cover: cover("#385268", "#d5b99b"),
        url: "https://music.163.com/",
        position: 83,
        duration: 228,
      },
    },
    {
      id: "b",
      name: "小云",
      connected: true,
      sharing: true,
      online: true,
      state: "paused",
      track: {
        title: "雨后的练习",
        artist: "示例乐队 / 一封蓝色信",
        cover: cover("#b2c4b8", "#426959"),
        url: "https://music.163.com/",
        position: 46,
        duration: 213,
      },
    },
  ],
};
export function MusicPreview() {
  const [data, setData] = useState(original),
    [error, setError] = useState("");
  const command = async (c: MusicCommand) => {
    setError("");
    setData((d) => {
      if (c.action === "sharing")
        return {
          ...d,
          sharing: c.enabled,
          members: d.members.map((m) =>
            m.id === d.selfId ? { ...m, sharing: c.enabled } : m,
          ),
        };
      if (c.action === "invite")
        return {
          ...d,
          invitation: {
            id: "example",
            from: d.selfId,
            to: c.to,
            leader: c.leader || d.selfId,
            title: c.title,
            url: c.url,
            mode: "sync",
            status: "pending",
            expires: Date.now() + 600000,
          },
        };
      if (c.action === "cancel" || c.action === "decline" || c.action === "end")
        return { ...d, invitation: undefined, session: undefined };
      if (c.action === "accept")
        return {
          ...d,
          invitation: undefined,
          session: {
            verified: true,
            leader: d.invitation!.leader,
            track: d.members.find((m) => m.id === d.invitation?.leader)!.track!,
            playing: true,
            canControl: d.invitation!.leader === d.selfId,
          },
        };
      if ((c.action === "play" || c.action === "pause") && d.session)
        return {
          ...d,
          session: { ...d.session, playing: c.action === "play" },
        };
      return d;
    });
  };
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#eaf2fb",
        padding: "28px",
        color: "#334d68",
      }}
    >
      <p style={{ fontSize: 14 }}>
        仅本地交互验收 · 演示数据 · 不代表已连接网易云
      </p>
      <nav
        style={{
          position: "fixed",
          bottom: 12,
          left: 16,
          right: 16,
          zIndex: 110,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          padding: 10,
          background: "#f8fbff",
          borderRadius: 10,
        }}
        aria-label="演示场景"
      >
        <button onClick={() => setData(original)}>各自听歌</button>
        <button
          onClick={() =>
            setData({
              ...original,
              invitation: {
                id: "example",
                from: "a",
                to: "b",
                leader: "b",
                title: original.members[1].track!.title,
                url: "https://music.163.com/",
                status: "pending",
                mode: "sync",
                expires: Date.now() + 600000,
              },
            })
          }
        >
          邀请等待
        </button>
        <button
          onClick={() =>
            setData({
              ...original,
              selfId: "b",
              invitation: {
                id: "example",
                from: "a",
                to: "b",
                leader: "a",
                title: original.members[0].track!.title,
                url: "https://music.163.com/",
                status: "pending",
                mode: "sync",
                expires: Date.now() + 600000,
              },
            })
          }
        >
          收到邀请
        </button>
        <button
          onClick={() =>
            setData({
              ...original,
              session: {
                verified: true,
                leader: "a",
                track: original.members[0].track!,
                playing: true,
                canControl: true,
              },
            })
          }
        >
          共同歌曲
        </button>
        <button
          onClick={() =>
            setData({
              ...original,
              selfId: "b",
              session: {
                verified: true,
                leader: "a",
                track: original.members[0].track!,
                playing: true,
                canControl: false,
              },
            })
          }
        >
          跟随方只读
        </button>
        <button
          onClick={() =>
            setData({
              ...original,
              members: original.members.map((m) => ({
                ...m,
                sharing: false,
                connected: false,
                state: "unavailable",
                track: undefined,
              })),
              capabilities: { sync: false, liveStatus: false },
              sharing: false,
            })
          }
        >
          尚未连接
        </button>
      </nav>
      <div
        className="participant-strip"
        style={{
          display: "flex",
          gap: 12,
          height: 88,
          maxWidth: 600,
          borderBottom: "1px solid #c3d2e5",
        }}
      >
        <div style={{ padding: 16 }}>小蓝的成员卡片</div>
        <div style={{ padding: 16 }}>小云的成员卡片</div>
        <div style={{ padding: 16 }}>邀请链接</div>
      </div>
      <MusicPanel
        data={data}
        error={error}
        busy={false}
        onCommand={command}
        initialOpen
        storageKey="music-demo-position-v2"
        previewLabel="交互预览 · 演示数据，非真实同步"
      />
    </main>
  );
}
