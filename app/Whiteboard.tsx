"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Eraser, Expand, Minimize2, PenLine, Save, Trash2, Type, GripHorizontal, Pipette } from "lucide-react";

export type BoardPoint = { x: number; y: number };
export type BoardStroke = { id: string; color: string; width: number; points: BoardPoint[]; createdAt: number; revision: string };
export type BoardText = { id: string; text: string; x: number; y: number; width: number; height: number; color: string; fontSize: number; confirmed: boolean; updatedAt: number; revision: string };
export type RoomBoard = { id: string; name: string; strokes: BoardStroke[]; texts: BoardText[]; deletedStrokeIds: string[]; deletedTextIds: string[]; epoch: string; createdAt: number };

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

let lastBoardRevisionMs = 0;
let boardRevisionSequence = 0;
function makeBoardRevision(observed = "") {
  const now = Math.max(Date.now(), lastBoardRevisionMs, (Number(observed.split(":")[0]) || 0) + 1);
  boardRevisionSequence = now === lastBoardRevisionMs ? boardRevisionSequence + 1 : 0;
  lastBoardRevisionMs = now;
  return `${now.toString().padStart(13, "0")}:${boardRevisionSequence.toString().padStart(4, "0")}:${crypto.randomUUID()}`;
}

function makeBoardTextUpdate(current: BoardText, patch: Partial<BoardText>): BoardText {
  return { ...current, ...patch, updatedAt: Date.now(), revision: makeBoardRevision(current.revision) };
}

export function Whiteboard({ board, fullscreen, onToggleFullscreen, onAddStroke, onDeleteStroke, onClear, onUpsertText, onDeleteText, onSaved }: {
  board: RoomBoard;
  fullscreen: boolean;
  onToggleFullscreen: () => Promise<void>;
  onAddStroke: (stroke: BoardStroke, epoch: string) => void;
  onDeleteStroke: (strokeId: string, epoch: string) => void;
  onClear: () => void;
  onUpsertText: (text: BoardText, epoch: string) => void;
  onDeleteText: (textId: string, epoch: string) => void;
  onSaved: (message: string, error?: boolean) => void;
}) {
  const [tool, setTool] = useState<"pen" | "erase-stroke" | "erase-area" | "text">("pen");
  const [color, setColor] = useState("#1c1b1d");
  const [width, setWidth] = useState(6);
  const [draft, setDraft] = useState<BoardStroke | null>(null);
  const [draftEpoch, setDraftEpoch] = useState(board.epoch);
  const [editingTextId, setEditingTextId] = useState("");
  const [saving, setSaving] = useState(false);
  const paperRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<BoardStroke | null>(null);
  const draftEpochRef = useRef(board.epoch);
  const lastStrokeBroadcastRef = useRef(0);
  const erasedDuringGestureRef = useRef(new Set<string>());
  const dragRef = useRef<{ id: string; pointerId: number; offsetX: number; offsetY: number } | null>(null);

  const visibleStrokes = useMemo(() => draft && draftEpoch === board.epoch && !board.deletedStrokeIds.includes(draft.id) ? [...board.strokes.filter((stroke) => stroke.id !== draft.id), draft] : board.strokes, [board.strokes, board.epoch, board.deletedStrokeIds, draft, draftEpoch]);

  useEffect(() => {
    const paper = paperRef.current;
    if (!paper) return;
    const adjustFont = (event: WheelEvent) => {
      const box = (event.target as Element | null)?.closest<HTMLElement>(".board-text-box.editing");
      const text = board.texts.find((item) => item.id === box?.dataset.textId);
      if (!text || !event.deltaY || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      onUpsertText(makeBoardTextUpdate(text, { fontSize: Math.max(10, Math.min(96, text.fontSize + (event.deltaY < 0 ? 2 : -2))) }), board.epoch);
    };
    paper.addEventListener("wheel", adjustFont, { passive: false });
    return () => paper.removeEventListener("wheel", adjustFont);
  }, [board.texts, board.epoch, onUpsertText]);

  const pointerPoint = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(BOARD_WIDTH, ((event.clientX - rect.left) / rect.width) * BOARD_WIDTH)),
      y: Math.max(0, Math.min(BOARD_HEIGHT, ((event.clientY - rect.top) / rect.height) * BOARD_HEIGHT)),
    };
  };

  const eraseWholeStroke = (point: BoardPoint) => {
    const hitDistance = Math.max(14, width * 2.2);
    const hit = [...board.strokes].reverse().find((stroke) => !erasedDuringGestureRef.current.has(stroke.id) && stroke.points.some((candidate) => pointDistance(candidate, point) <= hitDistance));
    if (!hit) return;
    erasedDuringGestureRef.current.add(hit.id);
    onDeleteStroke(hit.id, board.epoch);
  };

  const beginStroke = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const point = pointerPoint(event);
    if (tool === "text") {
      const text: BoardText = { id: crypto.randomUUID(), text: "", x: point.x, y: point.y, width: 280, height: 92, color, fontSize: Math.min(96, Math.max(36, width * 6)), confirmed: false, updatedAt: Date.now(), revision: makeBoardRevision() };
      setEditingTextId(text.id);
      onUpsertText(text, board.epoch);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    erasedDuringGestureRef.current.clear();
    if (tool === "erase-stroke") { eraseWholeStroke(point); return; }
    const stroke: BoardStroke = { id: crypto.randomUUID(), color: tool === "erase-area" ? "#ffffff" : color, width: tool === "erase-area" ? Math.max(24, width * 4) : width, points: [point], createdAt: Date.now(), revision: makeBoardRevision() };
    draftRef.current = stroke;
    draftEpochRef.current = board.epoch;
    setDraftEpoch(board.epoch);
    setDraft(stroke);
    onAddStroke(stroke, board.epoch);
    lastStrokeBroadcastRef.current = event.timeStamp;
  };

  const continueStroke = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const point = pointerPoint(event);
    if (tool === "erase-stroke") { eraseWholeStroke(point); return; }
    const current = draftRef.current;
    if (draftEpochRef.current !== board.epoch || (current && board.deletedStrokeIds.includes(current.id))) {
      draftRef.current = null;
      setDraft(null);
      return;
    }
    if (!current || pointDistance(current.points[current.points.length - 1], point) < 1.5) return;
    const next = { ...current, points: [...current.points, point], revision: makeBoardRevision() };
    draftRef.current = next;
    setDraft(next);
    if (event.timeStamp - lastStrokeBroadcastRef.current >= 32) {
      onAddStroke(next, board.epoch);
      lastStrokeBroadcastRef.current = event.timeStamp;
    }
  };

  const finishStroke = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    erasedDuringGestureRef.current.clear();
    const finished = draftRef.current;
    if (!finished) return;
    if (draftEpochRef.current === board.epoch && !board.deletedStrokeIds.includes(finished.id)) onAddStroke(finished, draftEpochRef.current);
    draftRef.current = null;
    setDraft(null);
  };

  const updateText = (current: BoardText, patch: Partial<BoardText>) => onUpsertText(makeBoardTextUpdate(current, patch), board.epoch);

  const beginTextDrag = (event: React.PointerEvent<HTMLButtonElement>, text: BoardText) => {
    event.preventDefault(); event.stopPropagation();
    const rect = paperRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id: text.id, pointerId: event.pointerId, offsetX: ((event.clientX - rect.left) / rect.width) * BOARD_WIDTH - text.x, offsetY: ((event.clientY - rect.top) / rect.height) * BOARD_HEIGHT - text.y };
  };

  const moveText = (event: React.PointerEvent<HTMLButtonElement>, text: BoardText) => {
    const drag = dragRef.current;
    const rect = paperRef.current?.getBoundingClientRect();
    if (!drag || drag.id !== text.id || drag.pointerId !== event.pointerId || !rect) return;
    const x = ((event.clientX - rect.left) / rect.width) * BOARD_WIDTH - drag.offsetX;
    const y = ((event.clientY - rect.top) / rect.height) * BOARD_HEIGHT - drag.offsetY;
    updateText(text, { x: Math.max(0, Math.min(BOARD_WIDTH - text.width, x)), y: Math.max(0, Math.min(BOARD_HEIGHT - text.height, y)) });
  };

  const finishTextDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
  };

  const syncTextSize = (element: HTMLDivElement, text: BoardText) => {
    const rect = paperRef.current?.getBoundingClientRect();
    if (!rect) return;
    const boxRect = element.getBoundingClientRect();
    const nextWidth = Math.max(120, Math.min(BOARD_WIDTH - text.x, (boxRect.width / rect.width) * BOARD_WIDTH));
    const nextHeight = Math.max(54, Math.min(BOARD_HEIGHT - text.y, (boxRect.height / rect.height) * BOARD_HEIGHT));
    if (Math.abs(nextWidth - text.width) > 1 || Math.abs(nextHeight - text.height) > 1) updateText(text, { width: nextWidth, height: nextHeight });
  };

  const saveBoard = async () => {
    setSaving(true);
    try {
      const rect = paperRef.current?.getBoundingClientRect();
      const visibleAspect = rect && rect.width > 10 && rect.height > 10 ? rect.width / rect.height : BOARD_WIDTH / BOARD_HEIGHT;
      const outputWidth = visibleAspect >= 1 ? 1920 : Math.round(1920 * visibleAspect);
      const outputHeight = visibleAspect >= 1 ? Math.round(1920 / visibleAspect) : 1920;
      const scaleX = outputWidth / BOARD_WIDTH;
      const scaleY = outputHeight / BOARD_HEIGHT;
      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("画板生成失败");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, outputWidth, outputHeight);
      context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
      board.strokes.forEach((stroke) => {
        if (!stroke.points.length) return;
        context.beginPath();
        context.moveTo(stroke.points[0].x, stroke.points[0].y);
        stroke.points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
        if (stroke.points.length === 1) context.lineTo(stroke.points[0].x + .01, stroke.points[0].y + .01);
        context.strokeStyle = stroke.color;
        context.lineWidth = stroke.width;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.stroke();
      });
      context.setTransform(1, 0, 0, 1, 0, 0);
      board.texts.forEach((text) => {
        const fontSize = text.fontSize * scaleX;
        const paddingX = fontSize * .6;
        const paddingTop = fontSize * .8;
        const maxWidth = Math.max(1, text.width * scaleX - paddingX * 2);
        context.save();
        context.beginPath();
        context.rect(text.x * scaleX, text.y * scaleY, text.width * scaleX, text.height * scaleY);
        context.clip();
        context.fillStyle = text.color;
        context.font = `${fontSize}px system-ui, sans-serif`;
        context.textBaseline = "alphabetic";
        const metrics = context.measureText("Mg");
        const ascent = metrics.fontBoundingBoxAscent;
        const descent = metrics.fontBoundingBoxDescent;
        const baselineOffset = (fontSize * 1.25 - ascent - descent) / 2 + ascent;
        const lines = text.text.split("\n").flatMap((paragraph) => {
          if (!paragraph) return [""];
          const wrapped: string[] = [];
          let line = "";
          Array.from(paragraph).forEach((character) => {
            const candidate = line + character;
            if (line && context.measureText(candidate).width > maxWidth) { wrapped.push(line); line = character; }
            else line = candidate;
          });
          wrapped.push(line);
          return wrapped;
        });
        lines.forEach((line, index) => context.fillText(line, text.x * scaleX + paddingX, text.y * scaleY + paddingTop + baselineOffset + index * fontSize * 1.25));
        context.restore();
      });
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("画板生成失败")), "image/png"));
      const timestamp = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date()).replace(/\D/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
      const response = await fetch("/api/cloud/files?path=board", { method: "POST", headers: { "Content-Type": "image/png", "X-File-Name": encodeURIComponent(`${board.name}-${timestamp}.png`) }, body: blob });
      const result = await response.json().catch(() => null) as { error?: unknown } | null;
      if (!response.ok) throw new Error(typeof result?.error === "string" ? result.error : "保存失败，请重试");
      onSaved("已保存到/board");
    } catch (error) { onSaved(error instanceof Error ? error.message : "保存失败，请重试", true); }
    finally { setSaving(false); }
  };

  return (
    <div className="whiteboard-shell">
      <div className={`whiteboard-paper tool-${tool}`} ref={paperRef}>
        <svg viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={board.name} onPointerDown={beginStroke} onPointerMove={continueStroke} onPointerUp={finishStroke} onPointerCancel={finishStroke}>
          <rect width="100%" height="100%" fill="#fff" />
          {visibleStrokes.map((stroke) => <path key={stroke.id} d={strokePath(stroke.points)} fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" />)}
        </svg>
        <div className="board-text-layer">
          {board.texts.map((text) => {
            const editing = editingTextId === text.id || !text.confirmed;
            return <div className={editing ? "board-text-box editing" : "board-text-box"} key={text.id} data-text-id={text.id} style={{ left: `${(text.x / BOARD_WIDTH) * 100}%`, top: `${(text.y / BOARD_HEIGHT) * 100}%`, width: `${(text.width / BOARD_WIDTH) * 100}%`, height: `${(text.height / BOARD_HEIGHT) * 100}%`, color: text.color, fontSize: `${text.fontSize / 12}cqw` }} onPointerUp={(event) => editing && syncTextSize(event.currentTarget, text)}>
              {editing ? <>
                <button className="board-text-drag" type="button" aria-label="拖动文本框"  onPointerDown={(event) => beginTextDrag(event, text)} onPointerMove={(event) => moveText(event, text)} onPointerUp={finishTextDrag} onPointerCancel={finishTextDrag}><GripHorizontal size={15} aria-hidden="true" /></button>
                <button className="board-text-delete" type="button" aria-label="删除文本框"  onClick={() => onDeleteText(text.id, board.epoch)}><Trash2 aria-hidden="true" /></button>
                <textarea value={text.text} autoFocus={editingTextId === text.id} aria-label="画板文本" onChange={(event) => updateText(text, { text: event.target.value })} onKeyDown={(event) => { if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return; event.preventDefault(); updateText(text, { confirmed: true }); setEditingTextId(""); }} />
              </> : <button className="board-text-content" type="button" onClick={() => { if (tool === "text") { setEditingTextId(text.id); updateText(text, { confirmed: false }); } }}>{text.text}</button>}
            </div>;
          })}
        </div>
      </div>
      <aside className="whiteboard-tools" aria-label="画板工具栏">
        <button className={tool === "pen" ? "active" : ""} type="button" onClick={() => setTool("pen")}  aria-label="画笔"><PenLine aria-hidden="true" /></button>
        <button className={tool.startsWith("erase") ? "active" : ""} type="button" onClick={() => setTool((current) => current === "erase-stroke" ? "erase-area" : "erase-stroke")}  aria-label={tool === "erase-area" ? "擦除部分" : "擦除整笔"}><Eraser aria-hidden="true" /><small>{tool === "erase-area" ? "局部" : "整笔"}</small></button>
        <button className={tool === "text" ? "active" : ""} type="button" onClick={() => setTool("text")}  aria-label="文本"><Type aria-hidden="true" /></button>
        <div className="board-colors" aria-label="画笔颜色">
          {["#1c1b1d", "#3478d4", "#df4a55"].map((item) => <button className={color === item ? "color active" : "color"} style={{ background: item }} type="button" onClick={() => { setColor(item); if (tool !== "text") setTool("pen"); }} key={item} aria-label={`选择颜色 ${item}`} />)}
          <label className="custom-color" ><input type="color" value={color} onChange={(event) => { setColor(event.target.value); if (tool !== "text") setTool("pen"); }} /><span><Pipette size={14} aria-hidden="true" /></span></label>
        </div>
        <label className="board-width" ><span>{width}px</span><input type="range" min="2" max="28" value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label>
        <button type="button" onClick={onClear}  aria-label="清屏"><Trash2 aria-hidden="true" /></button>
        <button type="button" onClick={() => void saveBoard()} disabled={saving}  aria-label="保存到云盘">{saving ? "…" : <Save aria-hidden="true" />}</button>
        <button type="button" onClick={() => void onToggleFullscreen()} aria-keyshortcuts="f"  aria-label={fullscreen ? "退出全屏" : "全屏"}>{fullscreen ? <Minimize2 aria-hidden="true" /> : <Expand aria-hidden="true" />}</button>
      </aside>
    </div>
  );
}
