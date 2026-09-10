"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { ClaimWorkflow, WorkflowCommand } from "./collaboration-types";

export function WorkflowTaskDeletion({ workflow, identityId, disabled, perform, onDeleted }: { workflow: ClaimWorkflow; identityId: string; disabled: boolean; perform: (command: WorkflowCommand) => Promise<boolean>; onDeleted?: () => void }) {
  const [armed, setArmed] = useState(false);
  const owner = workflow.reviewerId === identityId;
  if (!owner && workflow.claimantId !== identityId) return null;
  const label = owner ? "删除发起任务" : "删除我的任务";
  return <div>
    {armed && <p className="coop-feedback" role="status">{owner ? "删除你一侧的原任务及公共便签，认领者任务与流程记录保留。" : "删除自己收集箱中的认领任务，流程进度与提交材料保留。"}</p>}
    <div className="coop-workflow-actions">
      <button type="button" className="coop-delete" disabled={disabled} onClick={() => {
        if (!armed) { setArmed(true); return; }
        void perform({ id: crypto.randomUUID(), workflowId: workflow.id, version: workflow.version, action: owner ? "delete-owner-task" : "delete-claimed-task" }).then(done => { if (done) { setArmed(false); onDeleted?.(); } });
      }}><Trash2 size={15} />{armed ? `确认${label}` : label}</button>
      {armed && <button type="button" disabled={disabled} onClick={() => setArmed(false)}>取消删除</button>}
    </div>
  </div>;
}
