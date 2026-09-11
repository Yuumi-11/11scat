"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";
import { taskAttachmentUrl, type DescriptionAttachment } from "./task-description-attachments";

export function attachmentPreviewKind(name: string) {
  const extension = name.split('.').pop()?.toLowerCase() || '';
  if (/^(png|jpe?g|gif|webp|avif|bmp|svg)$/.test(extension)) return 'image';
  if (/^(txt|md|json|csv|log|yaml|yml|xml|html|css|js|ts|py|cpp|c|h|java)$/.test(extension)) return 'text';
  if (extension === 'pdf') return 'pdf';
  if (/^(mp3|m4a|wav|ogg|flac|aac)$/.test(extension)) return 'audio';
  if (/^(mp4|webm|mov)$/.test(extension)) return 'video';
  return 'download';
}

type PreviewFile = DescriptionAttachment | { name: string; url: string; downloadUrl: string };

export function TaskAttachmentPreview({ file, onClose }: { file: PreviewFile; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), close = useRef<HTMLButtonElement>(null);
  const [text, setText] = useState<string | null>(null), [error, setError] = useState('');
  const kind = attachmentPreviewKind(file.name), url = 'path' in file ? taskAttachmentUrl(file.path) : file.url;
  const downloadUrl = 'path' in file ? taskAttachmentUrl(file.path, true) : file.downloadUrl;
  useLayoutEffect(() => {
    const element = dialog.current!, trigger = document.activeElement;
    element.showModal(); close.current?.focus();
    return () => { element.close(); if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    if (kind !== 'text') return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(url, { signal: controller.signal, headers: { Range: 'bytes=0-1048575' } });
        if (!response.ok) throw new Error('附件暂时无法读取，请重试或下载。');
        const content = await response.text();
        const range = /bytes \d+-(\d+)\/(\d+)/.exec(response.headers.get('content-range') || '');
        if (!controller.signal.aborted) setText(content + (range && Number(range[1]) + 1 < Number(range[2]) ? '\n\n仅预览前 1 MB，完整内容请下载。' : ''));
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '预览失败'); }
    })();
    return () => controller.abort();
  }, [kind, url]);
  const failed = () => setError('附件暂时无法预览，可下载后查看。');
  return createPortal(<dialog ref={dialog} className={`task-attachment-preview${kind === 'image' ? ' image-preview' : ''}`} aria-label={`附件预览：${file.name}`} onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }} onKeyDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
    <header>{kind !== 'image' && <strong>{file.name}</strong>}<a href={downloadUrl} download={file.name} aria-label="下载附件"><Download size={20} aria-hidden="true" /></a><button ref={close} type="button" aria-label="关闭附件预览" onClick={onClose}><X size={20} aria-hidden="true" /></button></header>
    <div className="task-attachment-preview-body">
      {error ? <p role="alert">{error}</p> : kind === 'image' ? <img src={url} alt={file.name} onError={failed} /> : kind === 'text' ? text === null ? <p role="status">正在读取…</p> : <pre>{text}</pre> : kind === 'pdf' ? <iframe src={url} title={file.name} /> : kind === 'audio' ? <audio controls src={url} onError={failed} /> : kind === 'video' ? <video controls src={url} onError={failed} /> : <p>此格式暂不支持在线预览，请下载后查看。</p>}
    </div>
  </dialog>, document.body);
}
