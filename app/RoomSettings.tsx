"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronRight, Settings, X } from "lucide-react";
import "./room-settings.css";

export type SettingsSection = { id: string; label: string; icon: ReactNode; content: ReactNode };

export function RoomSettings({ sections }: { sections: SettingsSection[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const section = sections.find(item => item.id === selected);
  const dialogRef = useRef<HTMLDialogElement>(null), triggerRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null), navRef = useRef<HTMLElement>(null);
  const lastSection = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current, trigger = triggerRef.current;
    dialog?.showModal();
    return () => { dialog?.close(); trigger?.focus({ preventScroll: true }); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (selected) headingRef.current?.focus({ preventScroll: true });
    else {
      const buttons = [...(navRef.current?.querySelectorAll<HTMLButtonElement>("button") || [])];
      (buttons.find(button => button.dataset.section === lastSection.current) || buttons[0])?.focus({ preventScroll: true });
    }
  }, [open, selected]);

  const back = () => setSelected(null);
  return <>
    <button ref={triggerRef} className="settings-button" type="button" aria-label="设置" aria-haspopup="dialog" aria-expanded={open} onClick={() => { setSelected(null); setOpen(true); }}><Settings size={18} aria-hidden="true" />设置</button>
    {open && createPortal(<dialog ref={dialogRef} className="room-settings-dialog" aria-labelledby="room-settings-title" onCancel={event => { event.preventDefault(); if (selected) back(); else setOpen(false); }} onKeyDown={event => event.stopPropagation()} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setOpen(false);
    }}>
      <header className="room-settings-heading">
        {section && <button className="settings-back" type="button" onClick={back}  aria-label="返回设置"><ArrowLeft size={20} aria-hidden="true" /></button>}
        <h2 ref={headingRef} id="room-settings-title" tabIndex={-1}>{section?.label || "设置"}</h2>
        <button className="settings-close" type="button" onClick={() => setOpen(false)}  aria-label="关闭设置"><X size={20} aria-hidden="true" /></button>
      </header>
      {section ? <div className="room-settings-content">{section.content}</div> : <nav ref={navRef} className="room-settings-sections" aria-label="设置分类">
        {sections.map(item => <button key={item.id} data-section={item.id} type="button" onClick={() => { lastSection.current = item.id; setSelected(item.id); }}><span className="settings-section-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span><ChevronRight size={18} aria-hidden="true" /></button>)}
      </nav>}
    </dialog>, document.body)}
  </>;
}
