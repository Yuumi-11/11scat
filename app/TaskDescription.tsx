"use client";
import { useEffect, useLayoutEffect, useId, useRef, useState } from "react";
import { clipboardFiles } from "./cloud-drive-actions";
import { attachmentMarkdown, descriptionAttachments, descriptionParts, type DescriptionAttachment } from "./task-description-attachments";
import { TaskAttachmentPreview } from "./TaskAttachmentPreview";
import { attachmentDisplayNames, pastedAttachmentName } from './task-attachment-labels';
import { readTaskResponse, taskErrorMessage } from './task-request';

export function TaskDescription({ content }: { content: string }) {
  const [preview, setPreview] = useState<DescriptionAttachment | null>(null);
  return <div className="task-description"><p className="coop-workflow-description">{descriptionParts(content).map((part, index) => 'text' in part ? part.text : <a key={index} href={part.file.url} onClick={event => { event.preventDefault(); event.stopPropagation(); setPreview(part.file); }}>{part.label}</a>)}</p>{preview && <TaskAttachmentPreview key={preview.path} file={preview} onClose={() => setPreview(null)} />}<TaskAttachments content={content} /></div>;
}

export function TaskAttachments({ content }: { content: string }) {
  const { attachments } = descriptionAttachments(content);
  const labels = attachmentDisplayNames(attachments);
  const [preview, setPreview] = useState<DescriptionAttachment | null>(null);
  return <>{attachments.length > 0 && <div className="task-description-files" aria-label="任务附件">{attachments.map((file, index) => <a key={file.path + ':' + index} href={file.url} onClick={event => { event.preventDefault(); event.stopPropagation(); setPreview(file); }}>[{labels[index]}]</a>)}</div>}{preview && <TaskAttachmentPreview key={preview.path} file={preview} onClose={() => setPreview(null)} />}</>;
}

export function TaskDescriptionEditor({ value, disabled, taskKey, onChange, onUploading }: { value: string; disabled: boolean; taskKey: string; onChange: (value: string) => void; onUploading: (busy: boolean) => void }) {
  const id = useId(), [uploading, setUploading] = useState(false), [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<DescriptionAttachment | null>(null);
  const editor = useRef<HTMLDivElement>(null), rendered = useRef<string | null>(null);
  const latest = useRef({ value, onChange, onUploading });
  const locked = useRef(false), active = useRef(true);
  const serialize = () => editor.current ? serializeDescription(editor.current) : latest.current.value;
  useEffect(() => { latest.current = { value, onChange, onUploading }; });
  useEffect(() => { active.current = true; return () => { active.current = false; latest.current.onUploading(false); }; }, []);
  useLayoutEffect(() => {
    if (!editor.current || rendered.current === value) return;
    editor.current.replaceChildren();
    for (const part of descriptionParts(value)) editor.current.append('text' in part ? document.createTextNode(part.text) : attachmentNode(part.markdown, part.label));
    rendered.current = value;
  }, [value]);
  const publish = () => {
    const nodes = Array.from(editor.current?.querySelectorAll<HTMLAnchorElement>('a[data-attachment]') || []);
    const labels = attachmentDisplayNames(nodes.map(node => descriptionAttachments(node.dataset.attachment || '').attachments[0]));
    nodes.forEach((node, index) => { node.textContent = `[${labels[index]}]`; });
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
    if (file) { event.preventDefault(); event.stopPropagation(); setPreview(file); }
  }} onPaste={event => {
    event.preventDefault(); if (disabled || locked.current) return;
    const files = clipboardFiles(event.clipboardData), range = rangeAtCursor();
    if (!files.length) {
      const text = event.clipboardData.getData('text/plain');
      if (!text) return;
      const node = document.createTextNode(text); range.deleteContents(); range.insertNode(node); range.setStartAfter(node); range.collapse(true);
      const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); publish(); return;
    }
    locked.current = true; publish(); setUploading(true); onUploading(true); setNotice("正在读取附件…");
    void (async () => {
      const errors: string[] = []; let inserted = false;
      for (const file of files) {
        if (!active.current) break;
        try {
          if (file.size > 20 * 1024 * 1024) throw new Error("单个附件不能超过20 MB");
          if (serialize().length > 7000) throw new Error("说明过长，请缩短后再粘贴附件");
          const scope = taskKey.replace(/[^A-Za-z0-9_-]/g, "_");
          const name = pastedAttachmentName(file, descriptionAttachments(serialize()).attachments);
          const response = await fetch(`/api/room/tasks/attachments?task=${encodeURIComponent(scope)}`, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(name) }, body: file, signal: AbortSignal.timeout(120000) });
          const result = await readTaskResponse(response, '上传失败');
          if (!result.item?.name || !result.item?.path) throw new Error('上传失败');
          if (!active.current) break;
          const node = attachmentNode(attachmentMarkdown(window.location.origin, result.item.name, result.item.path));
          if (!inserted) range.deleteContents();
          range.insertNode(node); range.setStartAfter(node); range.collapse(true);
          const space = document.createTextNode(" "); range.insertNode(space); range.setStartAfter(space); range.collapse(true);
          inserted = true; publish();
        } catch (error) { errors.push(`${file.name}：${taskErrorMessage(error, '上传失败')}`); }
      }
      if (active.current) {
        setNotice(errors.length ? errors.join("；") : ""); setUploading(false); latest.current.onUploading(false);
        requestAnimationFrame(() => { if (!active.current || !editor.current) return; editor.current.focus(); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); });
      }
      locked.current = false;
    })();
  }} /><TaskAttachments content={value} />{notice && <small role="status" className="task-attachment-status">{notice}</small>}{preview && <TaskAttachmentPreview key={preview.path} file={preview} onClose={() => setPreview(null)} />}</div>;
}

function attachmentNode(markdown: string, label?: string) {
  const file = descriptionAttachments(markdown).attachments[0];
  const link = document.createElement('a');
  link.textContent = label || `[${file.name}]`; link.href = file.url;
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
