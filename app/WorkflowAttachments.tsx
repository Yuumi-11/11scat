"use client";

import { useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import type { WorkflowFile } from './collaboration-types';
import { attachmentDisplayNames, imageAttachmentExtension } from './task-attachment-labels';
import { TaskAttachmentPreview } from './TaskAttachmentPreview';

export function WorkflowAttachments({ files, disabled = false, onRemove }: { files: WorkflowFile[]; disabled?: boolean; onRemove?: (file: WorkflowFile, label: string) => void }) {
  const [preview, setPreview] = useState<{ file: WorkflowFile; label: string } | null>(null);
  const labels = attachmentDisplayNames(files, true);
  return <>{files.length > 0 && <div className="workflow-attachment-list">{files.map((file, index) => {
    const label = labels[index], image = !!imageAttachmentExtension(file.name);
    return <span key={file.id} className="workflow-attachment">
      {image ? <a className="workflow-image-thumb" href={`${file.url}?preview=1`} aria-label={`预览 ${label}`} onClick={event => { event.preventDefault(); event.stopPropagation(); setPreview({ file, label }); }}><img src={`${file.url}?preview=1`} alt={label} loading="lazy" /></a> : <a className="workflow-file-link" href={file.url} download={file.name}><Paperclip size={14} aria-hidden="true" />[{label}]</a>}
      {onRemove && <button className="workflow-attachment-remove" type="button" disabled={disabled} aria-label={`移除附件 ${label}`} onClick={() => onRemove(file, label)}><X size={14} aria-hidden="true" /></button>}
    </span>;
  })}</div>}{preview && <TaskAttachmentPreview file={{ name: preview.label, url: `${preview.file.url}?preview=1`, downloadUrl: preview.file.url }} onClose={() => setPreview(null)} />}</>;
}
