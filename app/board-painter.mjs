import { createChalkRenderer } from './chalk-renderer.mjs';
import { fitBoardText, measureBoardText } from './board-text-layout.mjs';
export { CHALK_FONT } from './board-text-layout.mjs';

export const BOARD_COLOR = '#3c645a';
export const CHALK_COLORS = [
  { name: '白色粉笔', color: '#f6f1dc' }, { name: '黄色粉笔', color: '#efd28a' },
  { name: '粉色粉笔', color: '#e0a7b5' },
];
export function isEraseStroke(stroke) {
  return stroke.tool === 'erase' || (!stroke.tool && !stroke.material && stroke.color.toLowerCase() === '#ffffff');
}
export function visibleBoardColor(item) {
  return !item.material && item.color.toLowerCase() === '#1c1b1d' ? CHALK_COLORS[0].color : item.color;
}
export function createBoardPainter(createCanvas) {
  const renderer = createChalkRenderer(createCanvas);
  const make = () => { const canvas = createCanvas(1200,720); canvas.width=1200; canvas.height=720; return canvas; };
  const base = make(), baseContext = base.getContext('2d');
  let cached = [], cachedEpoch = '';
  const key = stroke => `${stroke.id}:${stroke.revision}`;
  function paintStroke(ctx, stroke) {
    if (isEraseStroke(stroke)) { renderer.erase(ctx, stroke); return; }
    const color = visibleBoardColor(stroke);
    if (stroke.material === 'chalk-v1') { renderer.drawStroke(ctx, {...stroke, color}); return; }
    if (!stroke.points.length) return;
    ctx.save(); ctx.strokeStyle=color; ctx.lineWidth=stroke.width; ctx.lineCap='round'; ctx.lineJoin='round';
    ctx.beginPath(); ctx.moveTo(stroke.points[0].x,stroke.points[0].y);
    if (stroke.points.length===1) ctx.lineTo(stroke.points[0].x+.01,stroke.points[0].y);
    for (const point of stroke.points.slice(1)) ctx.lineTo(point.x,point.y);
    ctx.stroke(); ctx.restore();
  }
  function drawStrokes(ctx, strokes, epoch = '') {
    const ordered = [...strokes].sort((a,b)=>a.createdAt-b.createdAt || a.id.localeCompare(b.id));
    const prefix = ordered.slice(0,-1), keys = prefix.map(key);
    // Cache the committed prefix. Only the moving final stroke is repainted on
    // normal pointer frames; deletion, conflict and epoch changes rebuild it.
    if (epoch!==cachedEpoch || cached.length>keys.length || cached.some((value,index)=>value!==keys[index])) {
      baseContext.clearRect(0,0,1200,720); cached=[]; cachedEpoch=epoch;
    }
    for (const stroke of prefix.slice(cached.length)) paintStroke(baseContext,stroke);
    cached=keys;
    ctx.clearRect(0,0,1200,720); ctx.drawImage(base,0,0);
    if (ordered.length) paintStroke(ctx,ordered.at(-1));
  }
  function drawTexts(ctx, texts) {
    for (const source of texts) {
      const item = fitBoardText(ctx, source);
      const { font, padX, padY, baseline, lineHeight, lines } = measureBoardText(ctx, item);
      ctx.save();ctx.beginPath();ctx.rect(item.x,item.y,item.width,item.height);ctx.clip();ctx.font=font;
      lines.forEach((text,index)=> {
        const x=item.x+padX,y=item.y+padY+baseline+index*lineHeight;
        if (item.material==='chalk-v1') renderer.drawText(ctx,{text,x,y,font,color:visibleBoardColor(item)});
        else {ctx.fillStyle=visibleBoardColor(item);ctx.textBaseline='alphabetic';ctx.fillText(text,x,y);}
      });
      ctx.restore();
    }
  }
  return { drawStrokes, drawTexts };
}
