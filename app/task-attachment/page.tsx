import { notFound, redirect } from "next/navigation";
import { attachmentPath } from "../task-description-attachments";
import { cloudFileUrl } from "../cloud-drive-actions";

export default async function TaskAttachment({ searchParams }: { searchParams: Promise<{ path?: string }> }) {
  const { path } = await searchParams;
  if (!path || !attachmentPath(path)) notFound();
  redirect(cloudFileUrl(path));
}
