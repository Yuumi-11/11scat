"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ViewedChatImage = { url: string; name: string };

export function ChatImageViewer({ image, onClose }: { image: ViewedChatImage; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [failed, setFailed] = useState(false);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <dialog
      ref={dialogRef}
      className="chat-image-viewer"
      aria-label="查看聊天图片"
      aria-modal="true"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
    >
      <button ref={closeRef} className="chat-image-viewer-close" type="button" aria-label="关闭图片" onClick={onClose}>×</button>
      <figure className="chat-image-viewer-content">
        {failed ? <p role="alert">图片加载失败，请关闭后重试。</p> : <img src={image.url} alt={image.name} onError={() => setFailed(true)} />}
        <figcaption>{image.name}</figcaption>
      </figure>
    </dialog>,
    document.body,
  );
}
