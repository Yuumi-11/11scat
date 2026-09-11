"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { classroomFullscreenScale, isFullscreenShortcut, toggleElementFullscreen } from "./fullscreen-controls";

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
      if (document.fullscreenElement !== stage) {
        const bounds = stage.getBoundingClientRect();
        stage.style.setProperty('--stage-base-width', `${bounds.width}px`);
        stage.style.setProperty('--stage-base-height', `${bounds.height}px`);
        stage.dataset.baseWidth = String(bounds.width);
        stage.dataset.baseHeight = String(bounds.height);
        for (const [selector, token] of [['.chalk-lettering', '--stage-chalk-font'], ['.chalk-date', '--stage-date-font']]) {
          const element = stage.querySelector(selector);
          if (element) stage.style.setProperty(token, getComputedStyle(element).fontSize);
        }
      }
      await toggleElementFullscreen(stage, document);
    } catch {
      setFullscreenError("无法切换全屏，请确认浏览器支持并重试");
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    const sync = () => {
      const stage = stageRef.current;
      const active = !!stage && document.fullscreenElement === stage;
      setFullscreen(active);
      if (active) {
        const width = Number(stage.dataset.baseWidth) || stage.clientWidth;
        const height = Number(stage.dataset.baseHeight) || stage.clientHeight;
        stage.style.setProperty('--stage-scale', String(classroomFullscreenScale(width, height, stage.clientWidth, stage.clientHeight)));
      }
    };
    const keydown = (event: KeyboardEvent) => {
      if (!isFullscreenShortcut(event, document.activeElement)) return;
      // A different viewer owns fullscreen; leave its keyboard behavior intact.
      if (document.fullscreenElement && document.fullscreenElement !== stageRef.current) return;
      event.preventDefault();
      void toggleFullscreen();
    };
    document.addEventListener("fullscreenchange", sync);
    window.addEventListener("resize", sync);
    window.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("keydown", keydown);
    };
  }, [toggleFullscreen]);

  return { stageRef, fullscreen, fullscreenError, toggleFullscreen };
}
