"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isFullscreenShortcut, toggleElementFullscreen } from "./fullscreen-controls";

export function useMainFullscreen() {
  const stageRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  const toggleFullscreen = useCallback(async () => {
    const stage = stageRef.current;
    if (!stage || busy.current) return;
    busy.current = true;
    setFullscreenError("");
    try {
      await toggleElementFullscreen(stage, document);
    } catch {
      setFullscreenError("无法切换全屏，请确认浏览器支持并重试");
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    const sync = () => setFullscreen(!!stageRef.current && document.fullscreenElement === stageRef.current);
    const keydown = (event: KeyboardEvent) => {
      if (!isFullscreenShortcut(event, document.activeElement)) return;
      // A different viewer owns fullscreen; leave its keyboard behavior intact.
      if (document.fullscreenElement && document.fullscreenElement !== stageRef.current) return;
      event.preventDefault();
      void toggleFullscreen();
    };
    document.addEventListener("fullscreenchange", sync);
    window.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      window.removeEventListener("keydown", keydown);
    };
  }, [toggleFullscreen]);

  return { stageRef, fullscreen, fullscreenError, toggleFullscreen };
}
