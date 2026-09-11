"use client";

import { useEffect, useRef, useState } from "react";

export function InlineTaskTitle({ initialValue, label, disabled, onSave, onCancel }: {
  initialValue: string; label: string; disabled: boolean; onSave: (title: string) => Promise<boolean>; onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [retry, setRetry] = useState(0);
  const input = useRef<HTMLInputElement>(null), saving = useRef(false), composing = useRef(false), cancelled = useRef(false);
  useEffect(() => { if (retry && !disabled) input.current?.focus({ preventScroll: true }); }, [retry, disabled]);
  async function save() {
    if (saving.current || disabled || composing.current || cancelled.current) return;
    const title = value.trim();
    if (!title) { cancelled.current = true; onCancel(); return; }
    saving.current = true;
    try { if (!await onSave(title)) setRetry(current => current + 1); }
    finally { saving.current = false; }
  }
  return <form className="coop-inline-title" onSubmit={event => { event.preventDefault(); void save(); }}>
    <input ref={input} autoFocus aria-label={label}  placeholder="任务名称" value={value} maxLength={500} disabled={disabled} enterKeyHint="done"
      onFocus={event => { event.target.select(); event.target.scrollIntoView({ block: "nearest", inline: "nearest" }); }} onChange={event => setValue(event.target.value)}
      onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
      onBlur={() => void save()} onKeyDown={event => {
        if (event.key === "Escape" && !disabled && !saving.current && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); cancelled.current = true; onCancel(); }
        if (event.key === "Enter" && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault();
      }} />
  </form>;
}
