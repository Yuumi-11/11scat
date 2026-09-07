type Rect = { top: number; bottom: number; right: number };
type Viewport = { top: number; left: number; width: number; height: number };

export function placeBellPanel(anchor: Rect, viewport: Viewport, contentHeight: number) {
  const edge = 12, gap = 8;
  const width = Math.max(0, Math.min(332, viewport.width - 2 * edge));
  const left = Math.max(viewport.left + edge, Math.min(anchor.right - width, viewport.left + viewport.width - edge - width));
  const start = viewport.top + edge, end = viewport.top + viewport.height - edge;
  const below = Math.max(0, end - anchor.bottom - gap), above = Math.max(0, anchor.top - gap - start);
  const desired = Math.min(480, Math.max(80, contentHeight));
  const upwards = below < Math.min(desired, 240) && above > below;
  const maxHeight = Math.max(0, Math.min(upwards ? above : below, viewport.height - 2 * edge, 480));
  const height = Math.min(desired, maxHeight);
  const top = Math.max(start, Math.min(upwards ? anchor.top - gap - height : anchor.bottom + gap, end - height));
  return { left, top, width, maxHeight };
}
