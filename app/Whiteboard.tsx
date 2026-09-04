"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type BoardPoint = { x: number; y: number };
export type BoardStroke = { id: string; color: string; width: number; points: BoardPoint[] };
export type RoomBoard = { id: string; name: string; strokes: BoardStroke[]; createdAt: number };

const BOARD_WIDTH = 1200;
const BOARD_HEIGHT = 720;

function strokePath(points: BoardPoint[]) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y} l .01 .01`;
  return points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
}

function pointDistance(left: BoardPoint, right: BoardPoint) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

export function Whiteboard({ board, onChange, onSaved }: {
  board: RoomBoard;
  onChange: (board: RoomBoard) => void;
  onSaved: (message: string, error?: boolean) => void;
}) {
  const [tool, setTool] = useState<"pen" | "erase-stroke" | "erase-area">("pen");
  const [color, setColor] = useState("#1c1b1d");
  const [width, setWidth] = useState(6);
  const [draft, setDraft] = useState<BoardStroke | null>(null);
  const [saving, setSaving] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === shellRef.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  const visibleStrokes = useMemo(() => draft ? [...board.strokes, draft] : board.strokes, [board.strokes, draft]);

  const pointerPoint = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(BOARD_WIDTH, ((event.clientX - rect.left) / rect.width) * BOARD_WIDTH)),
      y: Math.max(0, Math.min(BOARD_HEIGHT, ((event.clientY - rect.top) / rect.height) * BOARD_HEIGHT)),
    };
  };

  const eraseWholeStroke = (point: BoardPoint) => {
    const hitDistance = Math.max(14, width * 2.2);
    const hit = [...board.strokes].reverse().find((stroke) => stroke.points.some((candidate) => pointDistance(candidate, point) <= hitDistance));
    if (hit) onChange({ ...board, strokes: board.strokes.filter((stroke) => stroke.id !== hit.id) });
  };

  const beginStroke = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointerPoint(event);
    if (tool === "erase-stroke") {
      eraseWholeStroke(point);
      return;
    }
    setDraft({
      id: crypto.randomUUID(),
      color: tool === "erase-area" ? "#ffffff" : color,
      width: tool === "erase-area" ? Math.max(24, width * 4) : width,
      points: [point],
    });
  };

  const continueStroke = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const point = pointerPoint(event);
    if (tool === "erase-stroke") {
      eraseWholeStroke(point);
      return;
    }
    setDraft((current) => {
      if (!current || pointDistance(current.points[current.points.length - 1], point) < 1.5) return current;
      return { ...current, points: [...current.points, point] };
    });
  };

  const finishStroke = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!draft) return;
    onChange({ ...board, strokes: [...board.strokes, draft] });
    setDraft(null);
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === shellRef.current) await document.exitFullscreen();
      else await shellRef.current?.requestFullscreen();
    } catch { onSaved("当前浏览器无法进入全屏", true); }
  };

  const saveBoard = async () => {
    setSaving(true);
    try {
      const paths = board.strokes.map((stroke) => `<path d="${strokePath(stroke.points)}" fill="none" stroke="${stroke.color}" stroke-width="${stroke.width}" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
      const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${BOARD_WIDTH}" height="${BOARD_HEIGHT}" viewBox="0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}"><rect width="100%" height="100%" fill="#fff"/>${paths}</svg>`;
      const imageUrl = URL.createObjectURL(new Blob([source], { type: "image/svg+xml" }));
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("画板生成失败"));
        image.src = imageUrl;
      });
      const canvas = document.createElement("canvas");
      canvas.width = BOARD_WIDTH;
      canvas.height = BOARD_HEIGHT;
      canvas.getContext("2d")?.drawImage(image, 0, 0);
      URL.revokeObjectURL(imageUrl);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("画板生成失败")), "image/png"));
      const timestamp = new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
      }).format(new Date()).replace(/\D/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
      const response = await fetch("/api/cloud/files?path=board", {
        method: "POST",
        headers: { "Content-Type": "image/png", "X-File-Name": encodeURIComponent(`${board.name}-${timestamp}.png`) },
        body: blob,
      });
      const result = await response.json().catch(() => null) as { error?: unknown } | null;
      if (!response.ok) throw new Error(typeof result?.error === "string" ? result.error : "保存失败，请重试");
      onSaved("已保存到/board");
    } catch (error) {
      onSaved(error instanceof Error ? error.message : "保存失败，请重试", true);
    } finally { setSaving(false); }
  };

  return (
    <div className={fullscreen ? "whiteboard-shell fullscreen" : "whiteboard-shell"} ref={shellRef}>
      <div className="whiteboard-paper">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
          role="img"
          aria-label={board.name}
          onPointerDown={beginStroke}
          onPointerMove={continueStroke}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
        >
          <rect width="100%" height="100%" fill="#fff" />
          {visibleStrokes.map((stroke) => <path key={stroke.id} d={strokePath(stroke.points)} fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" />)}
        </svg>
      </div>
      <aside className="whiteboard-tools" aria-label="画板工具栏">
        <button className={tool === "pen" ? "active" : ""} type="button" onClick={() => setTool("pen")} title="画笔">✎</button>
        <button className={tool === "erase-stroke" ? "active" : ""} type="button" onClick={() => setTool("erase-stroke")} title="擦除整笔">⌫</button>
        <button className={tool === "erase-area" ? "active" : ""} type="button" onClick={() => setTool("erase-area")} title="擦除经过位置">◫</button>
        <div className="board-colors" aria-label="画笔颜色">
          {["#1c1b1d", "#3478d4", "#df4a55"].map((item) => <button className={color === item ? "color active" : "color"} style={{ background: item }} type="button" onClick={() => { setColor(item); setTool("pen"); }} key={item} aria-label={`选择颜色 ${item}`} />)}
          <label className="custom-color" title="自定义颜色"><input type="color" value={color} onChange={(event) => { setColor(event.target.value); setTool("pen"); }} /><span>＋</span></label>
        </div>
        <label className="board-width" title="画笔粗细"><span>{width}px</span><input type="range" min="2" max="28" value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label>
        <button type="button" onClick={() => onChange({ ...board, strokes: [] })} title="清屏">清</button>
        <button type="button" onClick={() => void saveBoard()} disabled={saving} title="保存到云盘 /board">{saving ? "…" : "存"}</button>
        <button type="button" onClick={() => void toggleFullscreen()} title={fullscreen ? "退出全屏" : "全屏"}>{fullscreen ? "↙" : "↗"}</button>
      </aside>
    </div>
  );
}
