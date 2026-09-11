export type TextGeometry = { x: number; y: number; width: number; height: number; fontSize: number };
export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
export function resizeTextGeometry(text: TextGeometry, handle: ResizeHandle, dx: number, dy: number): TextGeometry {
  const west = handle.includes('w'), north = handle.includes('n');
  if (handle.length === 2) {
    const anchorX = west ? text.x + text.width : text.x;
    const anchorY = north ? text.y + text.height : text.y;
    const maxWidth = west ? anchorX : 1200 - anchorX;
    const maxHeight = north ? anchorY : 720 - anchorY;
    const requested = 1 + ((west ? -dx : dx) * text.width + (north ? -dy : dy) * text.height) / (text.width ** 2 + text.height ** 2);
    const maximum = Math.min(96 / text.fontSize, maxWidth / text.width, maxHeight / text.height);
    const minimum = Math.min(maximum, Math.max(10 / text.fontSize, 80 / text.width, 40 / text.height));
    const scale = clamp(requested, minimum, maximum);
    const width = text.width * scale, height = text.height * scale;
    return { x: west ? anchorX - width : anchorX, y: north ? anchorY - height : anchorY, width, height, fontSize: text.fontSize * scale };
  }
  let { x, y, width, height } = text;
  if (handle === 'e') width = clamp(width + dx, 80, 1200 - x);
  if (handle === 's') height = clamp(height + dy, 40, 720 - y);
  if (handle === 'w') { const edge = x + width; x = clamp(x + dx, 0, edge - 80); width = edge - x; }
  if (handle === 'n') { const edge = y + height; y = clamp(y + dy, 0, edge - 40); height = edge - y; }
  return { x, y, width, height, fontSize: text.fontSize };
}
export function scaleTextGeometry(text: TextGeometry, factor: number) {
  return resizeTextGeometry(text, 'se', text.width * (factor - 1), text.height * (factor - 1));
}
