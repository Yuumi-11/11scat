"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Eraser, Expand, Minimize2, PenLine, Save, Trash2, Type, GripHorizontal, Pipette } from "lucide-react";
import { BOARD_COLOR, CHALK_COLORS, createBoardPainter, visibleBoardColor } from "./board-painter.mjs";

export type BoardPoint = { x: number; y: number };
export type BoardStroke = { id: string; color: string; width: number; points: BoardPoint[]; createdAt: number; revision: string; tool?: "pen" | "erase"; material?: "chalk-v1" };
export type BoardText = { id: string; text: string; x: number; y: number; width: number; height: number; color: string; fontSize: number; confirmed: boolean; updatedAt: number; revision: string; material?: "chalk-v1" };
export type RoomBoard = { id: string; name: string; strokes: BoardStroke[]; texts: BoardText[]; deletedStrokeIds: string[]; deletedTextIds: string[]; epoch: string; createdAt: number };

const BOARD_WIDTH = 1200;
const BOARD_HEIGHT = 720;

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

export function Whiteboard({ board, fullscreen, onToggleFullscreen, onAddStroke, onDeleteStroke, onClear, onUpsertText, onDeleteText, onSaved, onExport }: {
  board: RoomBoard;
  fullscreen: boolean;
  onToggleFullscreen: () => Promise<void>;
  onAddStroke: (stroke: BoardStroke, epoch: string) => void;
  onDeleteStroke: (strokeId: string, epoch: string) => void;
  onClear: () => void;
  onUpsertText: (text: BoardText, epoch: string) => void;
  onDeleteText: (textId: string, epoch: string) => void;
  onSaved: (message: string, error?: boolean) => void;
  onExport?: (blob: Blob) => Promise<void>;
}) {
  const [tool, setTool] = useState<"pen" | "erase-stroke" | "erase-area" | "text">("pen");
  const [color, setColor] = useState("#f6f1dc");
  const [width, setWidth] = useState(6);
  const [draft, setDraft] = useState<BoardStroke | null>(null);
  const [draftEpoch, setDraftEpoch] = useState(board.epoch);
  const [editingTextId, setEditingTextId] = useState("");
  const [saving, setSaving] = useState(false);
  const paperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textCanvasRef = useRef<HTMLCanvasElement>(null);
  const painterRef = useRef<ReturnType<typeof createBoardPainter> | null>(null);
  const draftRef = useRef<BoardStroke | null>(null);
  const draftEpochRef = useRef(board.epoch);
  const lastStrokeBroadcastRef = useRef(0);
  const erasedDuringGestureRef = useRef(new Set<string>());
  const activePointerRef = useRef<number | null>(null);
  const dragRef = useRef<{ id: string; pointerId: number; offsetX: number; offsetY: number } | null>(null);

  const visibleStrokes = useMemo(() => draft && draftEpoch === board.epoch && !board.deletedStrokeIds.includes(draft.id) ? [...board.strokes.filter((stroke) => stroke.id !== draft.id), draft] : board.strokes, [board.strokes, board.epoch, board.deletedStrokeIds, draft, draftEpoch]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const ctx = canvasRef.current?.getContext("2d"); if (!ctx) return;
      painterRef.current ||= createBoardPainter(() => document.createElement("canvas"));
      painterRef.current.drawStrokes(ctx, visibleStrokes, board.epoch);
    });
    return () => cancelAnimationFrame(frame);
  }, [visibleStrokes, board.epoch]);
  useEffect(() => {
    let cancelled = false;
    const paint = () => {
      const ctx = textCanvasRef.current?.getContext("2d"); if (!ctx || cancelled) return;
      painterRef.current ||= createBoardPainter(() => document.createElement("canvas"));
      ctx.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
      painterRef.current.drawTexts(ctx, board.texts.filter(text => text.confirmed && text.id !== editingTextId));
    };
    paint();
    void document.fonts.load('32px "Long Cang"', board.texts.map(text => text.text).join("")).then(paint, () => undefined);
    return () => { cancelled = true; };
  }, [board.texts, editingTextId]);

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

  const pointerPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
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

  const beginStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    if (activePointerRef.current !== null) return;
    event.preventDefault();
    const point = pointerPoint(event);
    if (tool === "text") {
      const text: BoardText = { id: crypto.randomUUID(), text: "", x: point.x, y: point.y, width: 280, height: 92, color, fontSize: Math.min(96, Math.max(36, width * 6)), confirmed: false, updatedAt: Date.now(), revision: makeBoardRevision(), material: "chalk-v1" };
      setEditingTextId(text.id);
      onUpsertText(text, board.epoch);
      return;
    }
    activePointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    erasedDuringGestureRef.current.clear();
    if (tool === "erase-stroke") { eraseWholeStroke(point); return; }
    const stroke: BoardStroke = { id: crypto.randomUUID(), color, width: tool === "erase-area" ? Math.max(24, width * 4) : width, points: [point], createdAt: Date.now(), revision: makeBoardRevision(), material: "chalk-v1", tool: tool === "erase-area" ? "erase" : "pen" };
    draftRef.current = stroke;
    draftEpochRef.current = board.epoch;
    setDraftEpoch(board.epoch);
    setDraft(stroke);
    onAddStroke(stroke, board.epoch);
    lastStrokeBroadcastRef.current = event.timeStamp;
  };

  const continueStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current !== event.pointerId) return;
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

  const finishStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current !== event.pointerId) return;
    activePointerRef.current = null;
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
      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("画板生成失败");
      await document.fonts.load('32px "Long Cang"', board.texts.map(text => text.text).join(""));
      const layer = document.createElement("canvas"); layer.width = BOARD_WIDTH; layer.height = BOARD_HEIGHT;
      const layerContext = layer.getContext("2d"); if (!layerContext) throw new Error("画板生成失败");
      const painter = createBoardPainter(() => document.createElement("canvas"));
      painter.drawStrokes(layerContext, board.strokes, board.epoch);
      painter.drawTexts(layerContext, board.texts);
      context.fillStyle = BOARD_COLOR; context.fillRect(0, 0, outputWidth, outputHeight);
      const texture = new Image(); texture.src = "/classroom/board.webp";
      await texture.decode().catch(() => undefined);
      if (texture.complete && texture.naturalWidth) {
        const pattern = context.createPattern(texture, "repeat");
        if (pattern) { context.fillStyle = pattern; context.fillRect(0, 0, outputWidth, outputHeight); }
      }
      context.drawImage(layer, 0, 0, outputWidth, outputHeight);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("画板生成失败")), "image/png"));
      if (onExport) { await onExport(blob); onSaved("已导出到本地"); return; }
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
        <canvas className="chalk-stroke-canvas" ref={canvasRef} width={BOARD_WIDTH} height={BOARD_HEIGHT} role="img" aria-label={board.name} onPointerDown={beginStroke} onPointerMove={continueStroke} onPointerUp={finishStroke} onPointerCancel={finishStroke} onLostPointerCapture={finishStroke} />
        <canvas className="chalk-text-canvas" ref={textCanvasRef} width={BOARD_WIDTH} height={BOARD_HEIGHT} aria-hidden="true" />
        <div className="board-text-layer">
          {board.texts.map((text) => {
            const editing = editingTextId === text.id || !text.confirmed;
            return <div className={editing ? "board-text-box editing" : "board-text-box"} key={text.id} data-text-id={text.id} style={{ left: `${(text.x / BOARD_WIDTH) * 100}%`, top: `${(text.y / BOARD_HEIGHT) * 100}%`, width: `${(text.width / BOARD_WIDTH) * 100}%`, height: `${(text.height / BOARD_HEIGHT) * 100}%`, color: visibleBoardColor(text), fontFamily: text.material === "chalk-v1" ? '"Long Cang", cursive' : "system-ui, sans-serif", fontSize: `${text.fontSize / 12}cqw` }} onPointerUp={(event) => editing && syncTextSize(event.currentTarget, text)}>
              {editing ? <>
                <button className="board-text-drag" type="button" aria-label="拖动文本框" title="拖动文本框" onPointerDown={(event) => beginTextDrag(event, text)} onPointerMove={(event) => moveText(event, text)} onPointerUp={finishTextDrag} onPointerCancel={finishTextDrag}><GripHorizontal size={15} aria-hidden="true" /></button>
                <button className="board-text-delete" type="button" aria-label="删除文本框" title="删除文本框" onClick={() => onDeleteText(text.id, board.epoch)}><Trash2 aria-hidden="true" /></button>
                <textarea value={text.text} autoFocus={editingTextId === text.id} aria-label="画板文本" onChange={(event) => updateText(text, { text: event.target.value })} onKeyDown={(event) => { if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return; event.preventDefault(); updateText(text, { confirmed: true }); setEditingTextId(""); }} />
              </> : <button className="board-text-content" type="button" onClick={() => { if (tool === "text") { setEditingTextId(text.id); updateText(text, { confirmed: false }); } }}>{text.text}</button>}
            </div>;
          })}
        </div>
      </div>
      <div className="chalk-palette" role="group" aria-label="粉笔颜色">
        <button className={tool.startsWith("erase") ? "ledge-eraser selected" : "ledge-eraser"} type="button" onClick={() => setTool(current => current === "erase-stroke" ? "erase-area" : "erase-stroke")} aria-label={tool === "erase-area" ? "板擦：局部擦除" : "板擦：整笔擦除"} title={tool === "erase-area" ? "局部擦除，点击切换整笔" : "整笔擦除，点击切换局部"}><span className="chalk-eraser" /></button>
        {CHALK_COLORS.map(item => <button key={item.color} className="chalk-choice" type="button" aria-label={item.name} aria-pressed={color === item.color && (tool === "pen" || tool === "text")} title={item.name} onClick={() => { setColor(item.color); if (tool !== "text") setTool("pen"); }}><span className="chalk-stick" style={{background:item.color}} /></button>)}
      </div>
      <aside className="whiteboard-tools" aria-label="画板工具栏">
        <button className={tool === "pen" ? "active" : ""} type="button" onClick={() => setTool("pen")} title="画笔" aria-label="画笔"><PenLine aria-hidden="true" /></button>
        <button className={tool.startsWith("erase") ? "active" : ""} type="button" onClick={() => setTool((current) => current === "erase-stroke" ? "erase-area" : "erase-stroke")} title={tool === "erase-area" ? "擦除部分（再次点击切换）" : "擦除整笔（再次点击切换）"} aria-label={tool === "erase-area" ? "擦除部分" : "擦除整笔"}><Eraser aria-hidden="true" /><small>{tool === "erase-area" ? "局部" : "整笔"}</small></button>
        <button className={tool === "text" ? "active" : ""} type="button" onClick={() => setTool("text")} title="文本" aria-label="文本"><Type aria-hidden="true" /></button>
        <div className="board-colors" aria-label="画笔颜色">
          <label className="custom-color" title="自定义颜色"><input aria-label="自定义粉笔颜色" type="color" value={color} onChange={(event) => { setColor(event.target.value); if (tool !== "text") setTool("pen"); }} /><span><Pipette size={14} aria-hidden="true" /></span></label>
        </div>
        <label className="board-width" title="画笔粗细"><span>{width}px</span><input type="range" min="2" max="28" value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label>
        <button type="button" onClick={onClear} title="清屏" aria-label="清屏"><Trash2 aria-hidden="true" /></button>
        <button type="button" onClick={() => void saveBoard()} disabled={saving} title="保存到云盘 /board" aria-label="保存到云盘">{saving ? "…" : <Save aria-hidden="true" />}</button>
        <button type="button" onClick={() => void onToggleFullscreen()} aria-keyshortcuts="f" title={fullscreen ? "退出全屏（F / Esc）" : "全屏（F）"} aria-label={fullscreen ? "退出全屏" : "全屏"}>{fullscreen ? <Minimize2 aria-hidden="true" /> : <Expand aria-hidden="true" />}</button>
      </aside>
    </div>
  );
}
