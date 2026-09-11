"use client";

import { useEffect, useRef, useState } from "react";
import { Archive, ArrowLeft, Check, ClipboardCheck, Paperclip, RotateCcw, Send, X } from "lucide-react";
import { TaskDescription } from "./TaskDescription";
import { WorkflowSettings } from "./WorkflowSettings";
import { attachmentDisplayText } from "./task-description-attachments";
import { TaskNoticeDot } from "./TaskNoticeDot";
import { workflowEventLabels, type TaskNotice } from "./collaboration-notifications";
import type { ClaimWorkflow, CollaborationSnapshot, WorkflowCommand, WorkflowFile } from "./collaboration-types";

export const workflowStatus: Record<ClaimWorkflow["status"], string> = { creating: "正在建立", working: "进行中", submitted: "待审批", rejected: "已打回", approving: "正在确认完成", done: "已完成" };
const eventLabels = workflowEventLabels;
export function ClaimWorkflows({ snapshot, initialId, busy, error, perform, onClose, retryUncertain, notices = [], onRead }: { notices?: TaskNotice[]; onRead?: (ids: string[]) => void; snapshot: CollaborationSnapshot; initialId: string | null; busy: boolean; error: string; perform: (command: WorkflowCommand) => Promise<boolean>; onClose: () => void; retryUncertain?: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState(initialId);
  const [archived, setArchived] = useState(false);
  useEffect(() => { const element = dialog.current, previous = document.activeElement; element?.showModal(); return () => { element?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); }; }, []);
  const workflow = snapshot.workflows.find(item => item.id === selected);
  const name = (id: string) => snapshot.members.find(member => member.id === id)?.name || "成员";
  return <dialog ref={dialog} className="coop-workflows" aria-label="认领工作流程" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onKeyDown={event => event.stopPropagation()}>
    <header><h3><ClipboardCheck size={20} />{archived ? "已完成归档" : "工作流程"}</h3><button className="coop-icon" type="button" aria-label="关闭工作流程" disabled={busy} onClick={onClose}><X size={20} /></button></header>
    {retryUncertain && <div className="coop-recovery">上次请求结果未确认。<button type="button" disabled={busy} onClick={retryUncertain}>核对并重试</button></div>}
    {workflow ? <WorkflowDetail key={workflow.id} notices={notices} onRead={onRead} workflow={workflow} identityId={snapshot.identityId} name={name} busy={busy || !!retryUncertain} error={error} perform={perform} back={() => setSelected(null)} /> : <WorkflowList notices={notices} onRead={onRead} workflows={snapshot.workflows} archived={archived} setArchived={setArchived} select={setSelected} name={name} />}
  </dialog>;
}
export function WorkflowList({ workflows, archived, setArchived, select, name, notices = [], onRead }: { notices?: TaskNotice[]; onRead?: (ids: string[]) => void; workflows: ClaimWorkflow[]; archived: boolean; setArchived: (value: boolean) => void; select: (id: string) => void; name: (id: string) => string }) {
  const unread = (id: string) => notices.filter(item => item.workflowId === id).map(item => item.id);
  const archiveUnread = workflows.filter(item => item.status === "done").reduce((count, item) => count + unread(item.id).length, 0);
  const visible = workflows.filter(item => archived ? item.status === "done" : item.status !== "done").sort((a, b) => Number(b.status === "submitted") - Number(a.status === "submitted") || Number(unread(b.id).length > 0) - Number(unread(a.id).length > 0) || (archived ? b.updatedAt - a.updatedAt : b.createdAt - a.createdAt));
  return <>
    <div className="coop-workflow-navigation"><button type="button" className="coop-workflow-back" onClick={() => setArchived(!archived)}>{archived ? <><ArrowLeft size={15} />未完成流程</> : <><Archive size={15} />已完成归档 <span>{workflows.filter(item => item.status === "done").length}</span>{archiveUnread > 0 && <span className="task-notice-count" aria-label={`${archiveUnread} 条归档新记录`}>{archiveUnread}</span>}</>}</button></div>
    <div className="coop-workflow-list">
      {!visible.length && <p className="coop-empty">{archived ? "暂无已完成的归档任务" : "暂无未完成的工作流程"}</p>}
      {visible.map(item => <button type="button" key={item.id} onClick={() => select(item.id)}><span><strong><TaskNoticeDot ids={unread(item.id)} onRead={onRead} />{item.title}</strong><small>{name(item.claimantId)} 认领 · {name(item.reviewerId)} 审批</small></span><span className={`coop-workflow-status ${item.status}`}>{item.taskAnomaly ? "任务状态异常" : item.reopenPending ? "正在恢复未完成" : item.needsSubmission ? "待补充提交" : workflowStatus[item.status]}</span></button>)}
    </div>
  </>;
}
function WorkflowDetail({ workflow, identityId, name, busy, error, perform, back, notices, onRead }: { notices: TaskNotice[]; onRead?: (ids: string[]) => void; workflow: ClaimWorkflow; identityId: string; name: (id: string) => string; busy: boolean; error: string; perform: (command: WorkflowCommand) => Promise<boolean>; back: () => void }) {
  const [comment, setComment] = useState(""), [files, setFiles] = useState<WorkflowFile[]>([]), [uploading, setUploading] = useState(false), [fileError, setFileError] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const uploadLock = useRef(false), input = useRef<HTMLInputElement>(null);
  const submit = !workflow.taskAnomaly && !workflow.editPending && workflow.claimantId === identityId && ["working", "rejected"].includes(workflow.status);
  const review = !workflow.taskAnomaly && !workflow.editPending && workflow.reviewerId === identityId && workflow.status === "submitted";
  const retry = (workflow.ownerDeletePending && workflow.reviewerId === identityId) || (workflow.reopenPending && [workflow.claimantId, workflow.reviewerId].includes(identityId)) || workflow.editPending || (workflow.status === "creating" && [workflow.claimantId, workflow.reviewerId].includes(identityId)) || (workflow.status === "approving" && workflow.reviewerId === identityId);
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
    if (await perform({ id: crypto.randomUUID(), workflowId: workflow.id, version: workflow.version, action, comment, ...(action === "reply-nudge" ? { replyTo: replyTo! } : {}), attachments: files.map(file => file.id) })) { setComment(""); setFiles([]); setReplyTo(null); }
  }
  return <div className="coop-workflow-detail">
    <section className="coop-workflow-main" aria-label="任务内容及操作">
    <button type="button" className="coop-workflow-back" disabled={disabled} onClick={back}><ArrowLeft size={15} />返回列表</button>
    <div className="coop-workflow-heading"><h4>{workflow.title}</h4><span className={`coop-workflow-status ${workflow.status}`}>{workflow.reopenPending ? "正在恢复未完成" : workflow.needsSubmission ? "待补充提交" : workflowStatus[workflow.status]}</span>
    <div className="coop-workflow-actions">{workflow.reviewerId === identityId && !["creating", "done"].includes(workflow.status) && <button type="button" className="coop-nudge" disabled={disabled} onClick={() => void act("nudge")}>催办</button>}{workflow.reviewerId === identityId && workflow.status !== "done" && <button type="button" disabled={disabled} onClick={() => void act("owner-complete")}><Check size={15} />直接完成</button>}
    </div></div>
    {workflow.fields.content && <TaskDescription content={workflow.fields.content} />}
    <p className="coop-workflow-people">{name(workflow.claimantId)} 认领 · {name(workflow.reviewerId)} 审批</p>
    <ol className="coop-workflow-events">{workflow.events.filter(event => event.type !== "completed").map(event => <li key={event.id}><div><strong><TaskNoticeDot ids={notices.filter(item => item.eventId === event.id && item.workflowId === workflow.id).map(item => item.id)} onRead={onRead} />{event.actorId ? name(event.actorId) : "系统"} · {eventLabels[event.type] || event.type}</strong><time>{new Date(event.at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div>{event.comment && <p>{event.type === "updated" && event.comment === "任务详情已同步到关联任务；待审批任务需按最新内容重新提交" ? "旧记录未保存具体修改内容" : attachmentDisplayText(event.comment)}</p>}{event.type === "nudge" && workflow.claimantId === identityId && !workflow.events.some(item => item.type === "reply-nudge" && item.replyTo === event.id) && <button type="button" className="coop-workflow-back" disabled={disabled} onClick={() => { setReplyTo(event.id); setComment(""); }}>回复催办</button>}{event.files.map(file => <a key={file.id} href={file.url} download={file.name}><Paperclip size={14} />{file.name}</a>)}</li>)}</ol>
    {(workflow.error || workflow.syncError || error || fileError) && <p className="coop-feedback error" role="alert">{fileError || error || workflow.syncError || workflow.error}</p>}
    {workflow.taskAnomaly && <div className="coop-recovery"><p>关联任务缺失。恢复只补回缺失任务，保留当前{workflowStatus[workflow.status]}进度和已提交材料。</p>{[workflow.claimantId, workflow.reviewerId].includes(identityId) && <button type="button" disabled={disabled} onClick={() => void act("restore-workflow")}><RotateCcw size={15} />恢复任务</button>}</div>}
    {replyTo && <div className="coop-workflow-compose"><label htmlFor="workflow-nudge-reply">回复催办</label><textarea id="workflow-nudge-reply" rows={3} maxLength={2000} disabled={disabled} value={comment} onChange={event => setComment(event.target.value)} /><div className="coop-workflow-actions"><button type="button" disabled={disabled} onClick={() => setReplyTo(null)}>取消</button><button type="button" disabled={disabled || !comment.trim()} onClick={() => void act("reply-nudge")}>发送回复</button></div></div>}
    {!replyTo && (submit || review) && <div className="coop-workflow-compose" onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }} onDrop={event => { event.preventDefault(); void upload(Array.from(event.dataTransfer.files)); }}>
      <label htmlFor={`comment-${workflow.id}`}>{review ? "审批评语" : "完成说明"}</label><textarea id={`comment-${workflow.id}`} rows={3} value={comment} maxLength={10000} disabled={disabled} onChange={event => setComment(event.target.value)} placeholder={review ? "可附上修改建议，或将附件拖到这里" : "可填写说明，或将附件拖到这里"} />
      <div className="coop-workflow-files">{files.map(file => <span key={file.id}><Paperclip size={13} />{file.name}<button type="button" disabled={disabled} aria-label={`移除附件 ${file.name}`} onClick={() => setFiles(current => current.filter(item => item.id !== file.id))}><X size={13} /></button></span>)}</div>
      <input ref={input} className="coop-sr-only" type="file" multiple tabIndex={-1} onChange={event => { void upload(Array.from(event.target.files || [])); event.target.value = ""; }} />
      <div className="coop-workflow-actions"><button type="button" disabled={disabled} onClick={() => input.current?.click()}><Paperclip size={15} />{uploading ? "上传中…" : "附件"}</button><small>每个 20 MB</small><span />{submit ? <button type="button" className="primary" disabled={disabled || (workflow.needsSubmission && !comment.trim() && !files.length)} onClick={() => void act("submit")}><Send size={15} />提交完成</button> : <><button type="button" disabled={disabled} onClick={() => void act("reject")}><RotateCcw size={15} />打回</button><button type="button" className="primary" disabled={disabled} onClick={() => void act("approve")}><Check size={15} />通过</button></>}</div>
    </div>}
    {retry && <button type="button" className="coop-save" disabled={disabled} onClick={() => void act("retry-workflow")}>{workflow.reopenPending ? "重试同步" : "核对并继续"}</button>}
    {workflow.status === "submitted" && !review && <p className="coop-workflow-people">等待 {name(workflow.reviewerId)} 审批</p>}
    </section>
    <WorkflowSettings workflow={workflow} identityId={identityId} disabled={disabled} perform={perform} />
  </div>;
}
