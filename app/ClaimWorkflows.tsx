"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ClipboardCheck, Paperclip, RotateCcw, Send, X } from "lucide-react";
import type { ClaimWorkflow, CollaborationSnapshot, WorkflowCommand, WorkflowFile } from "./collaboration-types";

export const workflowStatus: Record<ClaimWorkflow["status"], string> = { creating: "正在建立", working: "进行中", submitted: "待审批", rejected: "已打回", approving: "正在确认完成", done: "已完成" };
const eventLabels: Record<string, string> = { claimed: "安排认领", submit: "提交完成", approve: "审批通过", reject: "打回修改", completed: "完成同步", "owner-complete": "发布者直接完成", updating: "修改详情", updated: "详情已同步", "update-replaced": "详情修改已替代" };
export function ClaimWorkflows({ snapshot, initialId, busy, error, perform, onClose, retryUncertain, onEdit }: { snapshot: CollaborationSnapshot; initialId: string | null; busy: boolean; error: string; perform: (command: WorkflowCommand) => Promise<boolean>; onClose: () => void; onEdit: (workflow: ClaimWorkflow) => void; retryUncertain?: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState(initialId);
  useEffect(() => { const element = dialog.current, previous = document.activeElement; element?.showModal(); return () => { element?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); }; }, []);
  const workflow = snapshot.workflows.find(item => item.id === selected);
  const name = (id: string) => snapshot.members.find(member => member.id === id)?.name || "成员";
  return <dialog ref={dialog} className="coop-workflows" aria-label="认领工作流程" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onKeyDown={event => event.stopPropagation()}>
    <header><h3><ClipboardCheck size={20} />工作流程</h3><button className="coop-icon" type="button" aria-label="关闭工作流程" disabled={busy} onClick={onClose}><X size={20} /></button></header>
    {retryUncertain && <div className="coop-recovery">上次请求结果未确认。<button type="button" disabled={busy} onClick={retryUncertain}>核对并重试</button></div>}
    {workflow ? <WorkflowDetail key={workflow.id} workflow={workflow} identityId={snapshot.identityId} name={name} busy={busy || !!retryUncertain} error={error} perform={perform} edit={() => onEdit(workflow)} back={() => setSelected(null)} /> : <div className="coop-workflow-list">
      {!snapshot.workflows.length && <p className="coop-empty">认领任务后，进度和审批记录会保存在这里。</p>}
      {snapshot.workflows.map(item => <button type="button" key={item.id} onClick={() => setSelected(item.id)}><span><strong>{item.title}</strong><small>{name(item.claimantId)} 认领 · {name(item.reviewerId)} 审批</small></span><span className={`coop-workflow-status ${item.status}`}>{workflowStatus[item.status]}</span></button>)}
    </div>}
  </dialog>;
}
function WorkflowDetail({ workflow, identityId, name, busy, error, perform, back, edit }: { workflow: ClaimWorkflow; identityId: string; name: (id: string) => string; busy: boolean; error: string; perform: (command: WorkflowCommand) => Promise<boolean>; back: () => void; edit: () => void }) {
  const [comment, setComment] = useState(""), [files, setFiles] = useState<WorkflowFile[]>([]), [uploading, setUploading] = useState(false), [fileError, setFileError] = useState("");
  const uploadLock = useRef(false), input = useRef<HTMLInputElement>(null);
  const submit = !workflow.editPending && workflow.claimantId === identityId && ["working", "rejected"].includes(workflow.status);
  const review = !workflow.editPending && workflow.reviewerId === identityId && workflow.status === "submitted";
  const retry = workflow.editPending || (workflow.status === "creating" && [workflow.claimantId, workflow.reviewerId].includes(identityId)) || (workflow.status === "approving" && workflow.reviewerId === identityId);
  const disabled = busy || uploading;
  async function upload(selected: File[]) {
    if (uploadLock.current || busy || !(submit || review)) return;
    if (files.length + selected.length > 10) { setFileError("每次提交最多 10 个附件"); return; }
    uploadLock.current = true; setUploading(true); setFileError("");
    try {
      for (const file of selected) {
        if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name} 超过 20 MB`);
        const response = await fetch(`/api/room/tasks/files?workflow=${encodeURIComponent(workflow.id)}&name=${encodeURIComponent(file.name)}`, { method: "POST", body: file, signal: AbortSignal.timeout(120000) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error || "上传失败");
        setFiles(current => [...current, data.file]);
      }
    } catch (cause) { setFileError(cause instanceof Error ? cause.message : "上传失败"); }
    finally { uploadLock.current = false; setUploading(false); }
  }
  async function act(action: WorkflowCommand["action"]) {
    if (await perform({ id: crypto.randomUUID(), workflowId: workflow.id, version: workflow.version, action, comment, attachments: files.map(file => file.id) })) { setComment(""); setFiles([]); }
  }
  return <div className="coop-workflow-detail">
    <button type="button" className="coop-workflow-back" disabled={disabled} onClick={back}><ArrowLeft size={15} />全部流程</button>
    <div className="coop-workflow-heading"><h4>{workflow.title}</h4><span className={`coop-workflow-status ${workflow.status}`}>{workflowStatus[workflow.status]}</span></div>
    <div className="coop-workflow-actions"><button type="button" disabled={disabled} onClick={edit}>详细设置</button>{workflow.reviewerId === identityId && workflow.status !== "done" && <button type="button" disabled={disabled} onClick={() => void act("owner-complete")}><Check size={15} />直接完成</button>}</div>
    <p className="coop-workflow-people">{name(workflow.claimantId)} 认领 · {name(workflow.reviewerId)} 审批</p>
    {workflow.fields.content && <p className="coop-workflow-description">{workflow.fields.content}</p>}
    <ol className="coop-workflow-events">{workflow.events.map(event => <li key={event.id}><div><strong>{name(event.actorId)} · {eventLabels[event.type] || event.type}</strong><time>{new Date(event.at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div>{event.comment && <p>{event.comment}</p>}{event.files.map(file => <a key={file.id} href={file.url} download={file.name}><Paperclip size={14} />{file.name}</a>)}</li>)}</ol>
    {(workflow.error || error || fileError) && <p className="coop-feedback error" role="alert">{fileError || error || workflow.error}</p>}
    {(submit || review) && <div className="coop-workflow-compose" onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }} onDrop={event => { event.preventDefault(); void upload(Array.from(event.dataTransfer.files)); }}>
      <label htmlFor={`comment-${workflow.id}`}>{review ? "审批评语" : "完成说明"}</label><textarea id={`comment-${workflow.id}`} rows={3} value={comment} maxLength={10000} disabled={disabled} onChange={event => setComment(event.target.value)} placeholder={review ? "可附上修改建议，或将附件拖到这里" : "可填写说明，或将附件拖到这里"} />
      <div className="coop-workflow-files">{files.map(file => <span key={file.id}><Paperclip size={13} />{file.name}<button type="button" disabled={disabled} aria-label={`移除附件 ${file.name}`} onClick={() => setFiles(current => current.filter(item => item.id !== file.id))}><X size={13} /></button></span>)}</div>
      <input ref={input} className="coop-sr-only" type="file" multiple tabIndex={-1} onChange={event => { void upload(Array.from(event.target.files || [])); event.target.value = ""; }} />
      <div className="coop-workflow-actions"><button type="button" disabled={disabled} onClick={() => input.current?.click()}><Paperclip size={15} />{uploading ? "上传中…" : "附件"}</button><small>每个 20 MB</small><span />{submit ? <button type="button" className="primary" disabled={disabled} onClick={() => void act("submit")}><Send size={15} />提交完成</button> : <><button type="button" disabled={disabled} onClick={() => void act("reject")}><RotateCcw size={15} />打回</button><button type="button" className="primary" disabled={disabled} onClick={() => void act("approve")}><Check size={15} />通过</button></>}</div>
    </div>}
    {retry && <button type="button" className="coop-save" disabled={disabled} onClick={() => void act("retry-workflow")}>核对并继续</button>}
    {workflow.status === "submitted" && !review && <p className="coop-workflow-people">等待 {name(workflow.reviewerId)} 审批</p>}
  </div>;
}
