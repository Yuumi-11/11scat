"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Settings, X } from "lucide-react";
import "./room-settings.css";

export type SettingsSection<Draft> = {
  id: string;
  label: string;
  icon: ReactNode;
  content: (draft: Draft, onChange: (draft: Draft) => void, saving: boolean) => ReactNode;
};
type SettingsProps<Draft> = {
  value: Draft;
  sections: SettingsSection<Draft>[];
  onSave: (draft: Draft) => Promise<void> | void;
  canSave?: boolean;
  error?: string;
  triggerContent?: ReactNode;
};

function SettingsDialog<Draft>({ value, sections, onSave, canSave = true, error, onClose }: SettingsProps<Draft> & { onClose: () => void }) {
  // A draft exists only for this opening of the dialog, shared by every category.
  const [draft, setDraft] = useState(() => structuredClone(value));
  const [selected, setSelected] = useState(sections[0]?.id);
  const [saving, setSaving] = useState(false), [saveError, setSaveError] = useState('');
  const busy = useRef(false), dialogRef = useRef<HTMLDialogElement>(null);
  const section = sections.find(item => item.id === selected) || sections[0];
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  const close = () => { if (!busy.current) onClose(); };
  const save = async () => {
    if (busy.current || !canSave) return;
    busy.current = true; setSaving(true); setSaveError('');
    try { await onSave(draft); onClose(); }
    catch (failure) { setSaveError(failure instanceof Error ? failure.message : '保存失败，请重试'); }
    finally { busy.current = false; setSaving(false); }
  };
  return <dialog ref={dialogRef} className="room-settings-dialog" aria-labelledby="room-settings-title" onCancel={event => { event.preventDefault(); close(); }} onKeyDown={event => event.stopPropagation()} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
  }}>
    <form className="room-settings-form" onSubmit={event => { event.preventDefault(); void save(); }}>
      <header className="room-settings-heading">
        <h2 id="room-settings-title">设置</h2>
        <button className="settings-close" type="button" onClick={close} disabled={saving} aria-label="关闭设置"><X size={20} aria-hidden="true" /></button>
      </header>
      <div className="room-settings-body">
        <nav className="room-settings-sections" aria-label="设置分类">
          {sections.map(item => <button key={item.id} type="button" className={item.id === section?.id ? 'active' : ''} aria-current={item.id === section?.id ? 'page' : undefined} disabled={saving} onClick={() => setSelected(item.id)}><span className="settings-section-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span></button>)}
        </nav>
        <section className="room-settings-content" aria-label={section?.label}>
          {section?.content(draft, setDraft, saving)}
        </section>
      </div>
      <footer className="room-settings-footer">
        {(saveError || error) && <p role="alert">{saveError || error}</p>}
        <button type="submit" className="settings-save" disabled={saving || !canSave}>{saving ? '正在保存…' : '保存修改'}</button>
      </footer>
    </form>
  </dialog>;
}

export function RoomSettings<Draft>(props: SettingsProps<Draft>) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = () => { setOpen(false); triggerRef.current?.focus({ preventScroll: true }); };
  return <>
    <button ref={triggerRef} className="settings-button" type="button" aria-label="设置" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>{props.triggerContent || <><Settings size={18} aria-hidden="true" />设置</>}</button>
    {open && createPortal(<SettingsDialog {...props} onClose={close} />, document.body)}
  </>;
}
