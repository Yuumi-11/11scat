"use client";
import { useEffect, useLayoutEffect, useId, useRef, useState } from "react";
import { clipboardFiles, cloudFileUrl, cloudRequest } from "./cloud-drive-actions";
import { attachmentMarkdown, descriptionAttachments, descriptionParts } from "./task-description-attachments";
import { ChatImageViewer, type ViewedChatImage } from "./ChatImageViewer";

export function TaskDescription({ content }: { content: string }) {
  const [image, setImage] = useState<ViewedChatImage | null>(null);
  return <div className="task-description"><p className="coop-workflow-description">{descriptionParts(content).map((part, index) => 'text' in part ? part.text : <a key={index} href={part.file.url} target="_blank" rel="noopener noreferrer" onClick={event => { event.stopPropagation(); if (/\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(part.file.path)) { event.preventDefault(); setImage({ name: part.file.name, url: cloudFileUrl(part.file.path) }); } }}>{part.file.name}</a>)}</p>{image && <ChatImageViewer image={image} onClose={() => setImage(null)} />}<TaskAttachments content={content} /></div>;
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
  const [image, setImage] = useState<ViewedChatImage | null>(null);
  const editor = useRef<HTMLDivElement>(null), rendered = useRef<string | null>(null);
  const latest = useRef({ value, onChange, onUploading });
  const locked = useRef(false), active = useRef(true);
  const serialize = () => editor.current ? serializeDescription(editor.current) : latest.current.value;
  useEffect(() => { latest.current = { value, onChange, onUploading }; });
  useEffect(() => { active.current = true; return () => { active.current = false; latest.current.onUploading(false); }; }, []);
  useLayoutEffect(() => {
    if (!editor.current || rendered.current === value) return;
    editor.current.replaceChildren();
    for (const part of descriptionParts(value)) editor.current.append('text' in part ? document.createTextNode(part.text) : attachmentNode(part.markdown));
    rendered.current = value;
  }, [value]);
  const publish = () => {
    const content = serialize();
    rendered.current = content; latest.current.value = content; latest.current.onChange(content);
  };
  const rangeAtCursor = () => {
    const selection = window.getSelection();
    if (selection?.rangeCount && editor.current?.contains(selection.getRangeAt(0).commonAncestorContainer)) return selection.getRangeAt(0).cloneRange();
    const range = document.createRange(); range.selectNodeContents(editor.current!); range.collapse(false); return range;
  };
  return <div className="workflow-description-input"><label id={id}>说明</label><div ref={editor} className="task-description-editable" role="textbox" aria-labelledby={id} aria-multiline="true" aria-disabled={disabled || uploading} contentEditable={!disabled && !uploading} suppressContentEditableWarning onInput={publish} onDrop={event => event.preventDefault()} onClick={event => {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[data-attachment]');
    if (!link) return;
    const file = descriptionAttachments(link.dataset.attachment || '').attachments[0];
    if (file && /\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(file.path)) { event.preventDefault(); setImage({ name: file.name, url: cloudFileUrl(file.path) }); }
  }} onPaste={event => {
    event.preventDefault(); if (disabled || locked.current) return;
    const files = clipboardFiles(event.clipboardData), range = rangeAtCursor();
    if (!files.length) {
      const text = event.clipboardData.getData('text/plain');
      if (!text) return;
      const node = document.createTextNode(text); range.deleteContents(); range.insertNode(node); range.setStartAfter(node); range.collapse(true);
      const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); publish(); return;
    }
    locked.current = true; publish(); setUploading(true); onUploading(true); setNotice("正在保存附件…");
    void (async () => {
      const errors: string[] = []; let inserted = false;
      for (const file of files) {
        if (!active.current) break;
        try {
          if (file.size > 20 * 1024 * 1024) throw new Error("单个附件不能超过20 MB");
          if (serialize().length > 7000) throw new Error("说明过长，请缩短后再粘贴附件");
          const folder = `tasks/${taskKey.replace(/[^A-Za-z0-9_-]/g, "_")}/${crypto.randomUUID()}`;
          const result = await cloudRequest(`/api/cloud/files?path=${encodeURIComponent(folder)}`, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name || "粘贴文件") }, body: file, signal: AbortSignal.timeout(120000) });
          if (!active.current) break;
          const node = attachmentNode(attachmentMarkdown(window.location.origin, result.item.name, result.item.path));
          if (!inserted) range.deleteContents();
          range.insertNode(node); range.setStartAfter(node); range.collapse(true);
          const space = document.createTextNode(" "); range.insertNode(space); range.setStartAfter(space); range.collapse(true);
          inserted = true; publish();
        } catch (error) { errors.push(`${file.name}：${error instanceof Error ? error.message : "上传失败"}`); }
      }
      if (active.current) {
        setNotice(errors.length ? errors.join("；") : "附件已保存云盘，保存修改后同步任务链接"); setUploading(false); latest.current.onUploading(false);
        requestAnimationFrame(() => { if (!active.current || !editor.current) return; editor.current.focus(); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); });
      }
      locked.current = false;
    })();
  }} /><TaskAttachments content={value} />{notice && <small role="status" className="task-attachment-status">{notice}</small>}{image && <ChatImageViewer image={image} onClose={() => setImage(null)} />}</div>;
}

function attachmentNode(markdown: string) {
  const file = descriptionAttachments(markdown).attachments[0];
  const link = document.createElement('a');
  link.textContent = file.name; link.href = file.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
  link.contentEditable = 'false'; link.dataset.attachment = markdown;
  return link;
}

export function serializeDescription(root: Node): string {
  const read = (node: Node): string => {
    if (node.nodeType === 3) return node.textContent || '';
    if (node instanceof HTMLElement && node.dataset.attachment && descriptionAttachments(node.dataset.attachment).attachments.length === 1) return node.dataset.attachment;
    if (node.nodeName === 'BR') return '\n';
    let text = '';
    for (const child of Array.from(node.childNodes)) {
      const block = child.nodeName === 'DIV' || child.nodeName === 'P';
      if (block && text && !text.endsWith('\n')) text += '\n';
      text += read(child);
    }
    return text;
  };
  return read(root);
}
