"use client";
import { Check, CloudUpload, LoaderCircle, RotateCcw } from "lucide-react";

export type CloudSaveState = "uploading" | "done" | "failed";
export function CloudSaveButton({ state, onClick }: { state?: CloudSaveState; onClick: () => void }) {
  const label = state === "uploading" ? "正在保存到云盘" : state === "done" ? "已保存到云盘" : state === "failed" ? "保存失败，点击重试" : "保存到云盘";
  const Icon = state === "uploading" ? LoaderCircle : state === "done" ? Check : state === "failed" ? RotateCcw : CloudUpload;
  return <button className={`image-cloud-button cloud-save-icon ${state || ""}`} type="button" onClick={onClick} disabled={state === "uploading" || state === "done"}  aria-label={label} aria-busy={state === "uploading"}><Icon size={18} aria-hidden="true" /></button>;
}
