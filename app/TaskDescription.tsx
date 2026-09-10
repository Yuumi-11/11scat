"use client";
import { useEffect, useId, useRef, useState } from "react";
import { clipboardFiles, cloudFileUrl, cloudRequest } from "./cloud-drive-actions";
import { attachmentMarkdown, descriptionAttachments } from "./task-description-attachments";
import { ChatImageViewer, type ViewedChatImage } from "./ChatImageViewer";

export function TaskDescription({ content }: { content: string }) {
  const { text } = descriptionAttachments(content);
  return <div className="task-description"><p className="coop-workflow-description">{text}</p><TaskAttachments content={content} /></div>;
}

export function TaskAttachments({ content }: { content: string }) {
  const { attachments } = descriptionAttachments(content);
  const [image, setImage] = useState<ViewedChatImage | null>(null);
  return <>{attachments.length > 0 && <div className="task-description-files" aria-label="任务附件">{attachments.map((file, index) => <a key={`${file.path}:${index}`} href={file.url} target="_blank" rel="noopener noreferrer" onClick={event => {
    event.stopPropagation();
    if (/\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(file.path)) { event.preventDefault(); setImage({ name: file.name, url: cloudFileUrl(file.path) }); }
  }}>{file.name}</a>)}</div>}{image && <ChatImageViewer image={image} onClose={() => setImage(null)} />}</>;
}

export function TaskDescriptionEditor({ value, disabled, taskKey, onChange, onUploading }: { value: string; disabled: boolean; taskKey: string; onChange: (value: string) => void; onUploading: (busy: boolean) => void }) {
  const id = useId(), [uploading, setUploading] = useState(false), [notice, setNotice] = useState("");
  const latest = useRef({ value, onChange, onUploading });
  const locked = useRef(false), active = useRef(true);
  useEffect(() => { latest.current = { value, onChange, onUploading }; });
  useEffect(() => { active.current = true; return () => { active.current = false; latest.current.onUploading(false); }; }, []);
  return <div className="workflow-description-input"><label htmlFor={id}>说明</label><textarea id={id} rows={3} maxLength={10000} value={value} disabled={disabled || uploading} onChange={event => onChange(event.target.value)} onPaste={event => {
    const files = clipboardFiles(event.clipboardData); if (!files.length) return;
    event.preventDefault(); if (disabled || locked.current) return;
    locked.current = true; onChange(value); setUploading(true); onUploading(true); setNotice("正在保存附件…");
    void (async () => {
      let content = latest.current.value;
      const errors: string[] = [];
      for (const file of files) {
        if (!active.current) break;
        try {
          if (file.size > 20 * 1024 * 1024) throw new Error("单个附件不能超过20 MB");
          if (content.length > 7000) throw new Error("说明过长，请缩短后再粘贴附件");
          const folder = `tasks/${taskKey.replace(/[^A-Za-z0-9_-]/g, "_")}/${crypto.randomUUID()}`;
          const result = await cloudRequest(`/api/cloud/files?path=${encodeURIComponent(folder)}`, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name || "粘贴文件") }, body: file, signal: AbortSignal.timeout(120000) });
          content += `${content ? "\n\n" : ""}${attachmentMarkdown(window.location.origin, result.item.name, result.item.path)}`;
          if (active.current) { latest.current.onChange(content); latest.current.value = content; }
        } catch (error) { errors.push(`${file.name}：${error instanceof Error ? error.message : "上传失败"}`); }
      }
      if (active.current) { setNotice(errors.length ? errors.join("；") : "附件已保存云盘，保存修改后同步任务链接"); setUploading(false); latest.current.onUploading(false); }
      locked.current = false;
    })();
  }} /><TaskAttachments content={value} />{notice && <small role="status" className="task-attachment-status">{notice}</small>}</div>;
}
