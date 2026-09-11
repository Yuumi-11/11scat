"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { normalizeThemeColor, THEME_PRESETS, type ThemeName } from "./theme-palette";

export function ThemeColorPicker({ theme, color, choosePreset, chooseCustom }: {
  theme: ThemeName; color: string;
  choosePreset: (name: keyof typeof THEME_PRESETS) => void;
  chooseCustom: (color: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState("");
  return <div className="theme-color-picker">
    <div className="theme-options" aria-label="预设主题颜色">
      {Object.entries(THEME_PRESETS).map(([name, preset]) => <button
        className={`theme-preset${theme === name ? " active" : ""}`} type="button" key={name}
        onClick={() => { choosePreset(name as keyof typeof THEME_PRESETS); setDraft(null); setError(""); }}
        aria-label={`${preset.name}主题`} aria-pressed={theme === name}
      ><span className="theme-color-dot" style={{ background: preset.color }} />{preset.name}{theme === name && <Check size={14} aria-hidden="true" />}</button>)}
    </div>
    <form className={`custom-theme-form${theme === "custom" ? " active" : ""}`} onSubmit={event => {
      event.preventDefault();
      const normalized = normalizeThemeColor(draft ?? color);
      if (!normalized) { setError("请输入 3 位或 6 位十六进制颜色，例如 #D68B42。"); return; }
      chooseCustom(normalized); setDraft(null); setError("");
    }}>
      <div className="custom-theme-heading"><label htmlFor="custom-theme-color">自由选色</label><small>{theme === "custom" ? "正在使用" : "选择你喜欢的颜色"}</small></div>
      <div className="custom-theme-fields">
        <input id="custom-theme-color" type="color" value={color} onChange={event => { chooseCustom(event.target.value); setDraft(null); setError(""); }} aria-label="自由选择主题颜色" />
        <input className="custom-theme-hex" aria-label="主题颜色十六进制值" aria-invalid={!!error} aria-describedby={error ? "custom-theme-error" : undefined} value={draft ?? color.toUpperCase()} maxLength={7} spellCheck={false} autoComplete="off" onChange={event => { setDraft(event.target.value); setError(""); }} />
        <button type="submit" className="primary-button">应用</button>
      </div>
      {error && <p id="custom-theme-error" role="alert" className="error-message">{error}</p>}
    </form>
    <p className="theme-color-help">背景、卡片和文字会一起配色，按钮明暗会自动调整以保持清晰。选择会保存在当前浏览器。</p>
  </div>;
}
