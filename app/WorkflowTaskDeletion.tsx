"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { ClaimWorkflow, WorkflowCommand } from "./collaboration-types";

export function WorkflowTaskDeletion({ workflow, identityId, disabled, perform, onDeleted }: { workflow: ClaimWorkflow; identityId: string; disabled: boolean; perform: (command: WorkflowCommand) => Promise<boolean>; onDeleted?: () => void }) {
  const [armed, setArmed] = useState(false);
  const owner = workflow.reviewerId === identityId;
  if (workflow.status === 'deleted' || (!owner && workflow.claimantId !== identityId)) return null;
  const label = "删除任务";
  return <div className="workflow-task-deletion">
    <div className="coop-workflow-actions">
      <button type="button" className="coop-delete workflow-delete-icon"  aria-label={armed ? `确认${label}` : label} disabled={disabled} onClick={() => {
        if (!armed) { setArmed(true); return; }
        void perform({ id: crypto.randomUUID(), workflowId: workflow.id, version: workflow.version, action: owner ? "delete-owner-task" : "delete-claimed-task" }).then(done => { if (done) { setArmed(false); onDeleted?.(); } });
      }}><Trash2 size={19} aria-hidden="true" /></button>
      {armed && <button type="button" disabled={disabled} onClick={() => setArmed(false)}>取消删除</button>}
    </div>
  </div>;
}
