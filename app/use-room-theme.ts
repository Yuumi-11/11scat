"use client";

import { createContext, createElement, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { createThemePalette, normalizeThemeColor, restoreTheme, THEME_PRESETS, type ThemeName } from "./theme-palette";

function useThemeController() {
  const [selection, setSelection] = useState(() => restoreTheme("blue", null));
  const palette = useMemo(() => createThemePalette(selection.color), [selection.color]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { setSelection(restoreTheme(localStorage.getItem("11scat-appearance-theme"), localStorage.getItem("11scat-appearance-custom-color"))); }
      catch { /* A blocked preference store still allows changing this session. */ }
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = Object.keys(palette).map(key => [key, root.style.getPropertyValue(key)]);
    const existingMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const meta = existingMeta || document.createElement("meta");
    const oldContent = meta.getAttribute("content");
    if (!existingMeta) { meta.name = "theme-color"; document.head.append(meta); }
    meta.content = palette["--theme-accent"];
    for (const [key, value] of Object.entries(palette)) root.style.setProperty(key, value);
    return () => {
      for (const [key, value] of previous) { if (value) root.style.setProperty(key, value); else root.style.removeProperty(key); }
      if (!existingMeta) meta.remove(); else if (oldContent === null) meta.removeAttribute("content"); else meta.content = oldContent;
    };
  }, [palette]);
  const choose = (name: ThemeName, color: string) => {
    setSelection({ name, color });
    try {
      if (name === "custom") localStorage.setItem("11scat-appearance-custom-color", color);
      localStorage.setItem("11scat-appearance-theme", name);
    } catch { /* Apply immediately even if local persistence is unavailable. */ }
  };
  return {
    theme: selection.name, color: selection.color,
    choosePreset: (name: keyof typeof THEME_PRESETS) => choose(name, THEME_PRESETS[name].color),
    chooseCustom: (input: string) => { const color = normalizeThemeColor(input); if (color) choose("custom", color); },
  };
}

const RoomThemeContext = createContext<ReturnType<typeof useThemeController> | null>(null);
export function RoomThemeProvider({ children }: { children: ReactNode }) {
  const theme = useThemeController();
  return createElement(RoomThemeContext.Provider, { value: theme }, children);
}
export function useRoomTheme() {
  const theme = useContext(RoomThemeContext);
  if (!theme) throw new Error("RoomThemeProvider is required");
  return theme;
}
