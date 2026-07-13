"use client";

import { useEffect, useRef, useState } from "react";

type Task = {
  id: number;
  title: string;
  project: string;
  done: boolean;
  source: "ticktick" | "local";
};

const initialTasks: Task[] = [
  { id: 1, title: "完成数据结构第三章习题", project: "期末复习", done: false, source: "ticktick" },
  { id: 2, title: "整理概率论错题", project: "期末复习", done: true, source: "ticktick" },
  { id: 3, title: "准备明天的小组汇报", project: "课程项目", done: false, source: "ticktick" },
];

const pad = (value: number) => String(value).padStart(2, "0");

export default function Home() {
  const [tasks, setTasks] = useState(initialTasks);
  const [draft, setDraft] = useState("");
  const [seconds, setSeconds] = useState(50 * 60);
  const [running, setRunning] = useState(false);
  const [shareMode, setShareMode] = useState<"detail" | "motion">("detail");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [shareError, setShareError] = useState("");
  const [syncOpen, setSyncOpen] = useState(false);
  const [demoConnected, setDemoConnected] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!running || seconds <= 0) return;
    const timer = window.setInterval(() => setSeconds((value) => value - 1), 1000);
    return () => window.clearInterval(timer);
  }, [running, seconds]);

  useEffect(() => {
    if (seconds === 0) setRunning(false);
  }, [seconds]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    return () => stream?.getTracks().forEach((track) => track.stop());
  }, [stream]);

  const addTask = () => {
    const title = draft.trim();
    if (!title) return;
    setTasks((current) => [
      ...current,
      { id: Date.now(), title, project: "本次自习", done: false, source: "local" },
    ]);
    setDraft("");
  };

  const toggleTask = (id: number) => {
    setTasks((current) =>
      current.map((task) => (task.id === id ? { ...task, done: !task.done } : task)),
    );
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
      if ((error as DOMException).name !== "NotAllowedError") {
        setShareError("没有成功开始共享，请重新选择一个窗口或屏幕。");
      }
    }
  };

  const stopShare = () => {
    stream?.getTracks().forEach((track) => track.stop());
    setStream(null);
  };

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  const completed = tasks.filter((task) => task.done).length;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="11scat 首页">
          <span className="brand-mark">11</span>
          <span>11scat</span>
          <small>BETA</small>
        </a>
        <div className="session-status">
          <span className="pulse" />
          自习房间 · 2 人在线
        </div>
        <div className="top-actions">
          <button className="icon-button" aria-label="静音">⌁</button>
          <button className="profile-button" aria-label="个人设置">你</button>
        </div>
      </header>

      <section className="workspace" id="top">
        <aside className="task-panel panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">TODAY</span>
              <h1>本次专注任务</h1>
            </div>
            <button className="sync-button" onClick={() => setSyncOpen(true)}>
              <span className={demoConnected ? "sync-dot active" : "sync-dot"} />
              {demoConnected ? "已同步" : "连接滴答清单"}
            </button>
          </div>

          <div className="progress-block">
            <div className="progress-copy">
              <span>{completed}/{tasks.length} 已完成</span>
              <strong>{tasks.length ? Math.round((completed / tasks.length) * 100) : 0}%</strong>
            </div>
            <div className="progress-track">
              <span style={{ width: `${tasks.length ? (completed / tasks.length) * 100 : 0}%` }} />
            </div>
          </div>

          <div className="task-list" aria-live="polite">
            {tasks.map((task) => (
              <label className={task.done ? "task-row done" : "task-row"} key={task.id}>
                <input
                  type="checkbox"
                  checked={task.done}
                  onChange={() => toggleTask(task.id)}
                />
                <span className="custom-check">✓</span>
                <span className="task-copy">
                  <strong>{task.title}</strong>
                  <small>
                    {task.source === "ticktick" ? "滴答清单" : "站内任务"} · {task.project}
                  </small>
                </span>
                <span className="drag-handle">⠿</span>
              </label>
            ))}
          </div>

          <div className="add-task">
            <span>＋</span>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && addTask()}
              placeholder="添加本次自习任务"
              aria-label="添加本次自习任务"
            />
            <button onClick={addTask}>添加</button>
          </div>

          <div className="partner-card">
            <div className="avatar partner-avatar">林</div>
            <div>
              <strong>林同学正在专注</strong>
              <span>已连续学习 34 分钟</span>
            </div>
            <span className="quiet-badge">请勿打扰</span>
          </div>
        </aside>

        <section className="focus-stage panel">
          <div className="stage-topline">
            <div className="stage-label"><span /> FOCUS SESSION</div>
            <button className="more-button" aria-label="更多选项">•••</button>
          </div>

          <div className="share-canvas">
            {stream ? (
              <video ref={videoRef} autoPlay muted playsInline aria-label="屏幕共享预览" />
            ) : (
              <div className="empty-share">
                <div className="share-glyph"><span /><span /><span /></div>
                <h2>共享你的学习窗口</h2>
                <p>文字与代码模式优先保留细节，网络波动时也尽量保持字迹清楚。</p>
                <button className="primary-button" onClick={startShare}>开始高清共享</button>
                <span className="privacy-note">只会共享你主动选择的窗口或屏幕</span>
              </div>
            )}

            <div className="partner-tile">
              <div className="partner-scene">
                <div className="lamp" />
                <div className="desk" />
                <div className="book book-one" />
                <div className="book book-two" />
                <div className="plant">✦</div>
              </div>
              <div className="partner-caption">
                <span className="avatar mini">林</span>
                <span>林同学</span>
                <span className="mic-state">⌁</span>
              </div>
            </div>
          </div>

          {shareError && <p className="error-message" role="alert">{shareError}</p>}

          <div className="quality-bar">
            <div className="quality-copy">
              <span className="quality-icon">HD</span>
              <div>
                <strong>{shareMode === "detail" ? "文字 / 代码优先" : "动态画面优先"}</strong>
                <small>
                  {shareMode === "detail" ? "最高 1440p · 15 FPS · 细节增强" : "最高 1080p · 30 FPS · 动态流畅"}
                </small>
              </div>
            </div>
            <div className="segmented" aria-label="共享清晰度模式">
              <button className={shareMode === "detail" ? "active" : ""} onClick={() => setShareMode("detail")}>文字 / 代码</button>
              <button className={shareMode === "motion" ? "active" : ""} onClick={() => setShareMode("motion")}>动态画面</button>
            </div>
            {stream && <button className="stop-button" onClick={stopShare}>停止共享</button>}
          </div>

          <div className="session-controls">
            <div className="timer-block">
              <span>本轮剩余</span>
              <strong>{pad(minutes)}:{pad(remainingSeconds)}</strong>
            </div>
            <button className="timer-toggle" onClick={() => setRunning((value) => !value)}>
              {running ? "暂停" : seconds === 50 * 60 ? "开始专注" : "继续"}
            </button>
            <button className="reset-button" onClick={() => { setSeconds(50 * 60); setRunning(false); }}>重置</button>
          </div>
        </section>
      </section>

      <footer className="footer-note">
        <span>专注连接稳定</span>
        <span>端到端传输设计</span>
        <span>任务数据由你授权</span>
      </footer>

      {syncOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSyncOpen(false)}>
          <section className="sync-modal" role="dialog" aria-modal="true" aria-labelledby="sync-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setSyncOpen(false)} aria-label="关闭">×</button>
            <span className="ticktick-mark">✓</span>
            <span className="eyebrow">TASK CONNECTION</span>
            <h2 id="sync-title">把滴答清单带进自习房间</h2>
            <p>授权后可读取任务、选择本轮清单，并把完成状态同步回滴答清单。我们不会读取你的账号密码。</p>
            <div className="permission-list">
              <span><i>✓</i> 读取任务与清单</span>
              <span><i>✓</i> 更新任务完成状态</span>
              <span><i>✓</i> 随时断开授权</span>
            </div>
            <button className="primary-button wide" onClick={() => { setDemoConnected(true); setSyncOpen(false); }}>
              使用演示数据体验同步
            </button>
            <a className="oauth-link" href="https://developer.ticktick.com/" target="_blank" rel="noreferrer">
              正式接入需要配置滴答开放平台 OAuth →
            </a>
          </section>
        </div>
      )}
    </main>
  );
}
