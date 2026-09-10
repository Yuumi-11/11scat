const editingSelector = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="searchbox"], [role="combobox"]';

function isEditing(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return !!(element?.isContentEditable || element?.closest?.(editingSelector));
}

export function isFullscreenShortcut(event: KeyboardEvent, activeElement: Element | null) {
  if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229
    || event.ctrlKey || event.metaKey || event.altKey || event.key.toLowerCase() !== "f") return false;
  // Check focus as well as the composed path: editors may contain nested or shadow DOM nodes.
  return !isEditing(activeElement) && !isEditing(event.target)
    && !event.composedPath().some(isEditing);
}

export async function toggleElementFullscreen(element: HTMLElement, owner: Document) {
  if (owner.fullscreenElement === element) {
    await owner.exitFullscreen();
  } else if (!owner.fullscreenElement) {
    if (!element.requestFullscreen || owner.fullscreenEnabled === false) {
      throw new Error("当前浏览器不支持主窗口全屏");
    }
    await element.requestFullscreen();
  }
}

export function classroomFullscreenScale(width: number, height: number, viewportWidth: number, viewportHeight: number) {
  // Include the projector overhang and the lower tray in the same scaled scene.
  return Math.min(viewportWidth / (width + 26), viewportHeight / (height + 70));
}
