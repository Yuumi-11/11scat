"use client";
import { useEffect, useRef } from "react";
import { watchNoticeVisibility } from "./task-notice-visibility";

// A scroll-hidden row or a background tab has not been browsed. A dot is
// acknowledged only after it has actually been visible for a short dwell.
export function TaskNoticeDot({ ids, onRead }: { ids: string[]; onRead?: (ids: string[]) => void }) {
  const element = useRef<HTMLSpanElement>(null), key = ids.join("|");
  useEffect(() => {
    const node = element.current;
    if (!node || !key || !onRead) return;
    return watchNoticeVisibility(node, () => onRead(key.split("|")));
  }, [key, onRead]);
  return ids.length ? <span ref={element} className="task-notice-dot" aria-label={`${ids.length} 条新记录`} /> : null;
}
