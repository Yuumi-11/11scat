import { imageAttachmentExtension } from './task-attachment-labels.ts';

export type DescriptionAttachment = { name: string; path: string; url: string };
export const taskAttachmentUrl = (path: string, download = false) => `/api/room/tasks/attachments?path=${encodeURIComponent(path)}${download ? "&download=1" : ""}`;
export const attachmentDisplayText = (content: string) => descriptionParts(content).map(part => 'text' in part ? part.text : part.label).join('');
export function descriptionParts(content: string): ({ text: string } | { file: DescriptionAttachment; markdown: string; label: string })[] {
  const parts: ({ text: string } | { file: DescriptionAttachment; markdown: string; label: string })[] = [];
  const pattern = /\[附件：([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let cursor = 0, image = 0;
  for (const match of content.matchAll(pattern)) {
    const file = descriptionAttachments(match[0]).attachments[0];
    if (!file) continue;
    const extension = imageAttachmentExtension(file.name);
    const label = `[${extension ? `图${++image}.${extension}` : file.name}]`;
    parts.push({ text: content.slice(cursor, match.index) }, { file, markdown: match[0], label });
    cursor = match.index! + match[0].length;
  }
  parts.push({ text: content.slice(cursor) });
  return parts;
}
const encodedPath = (path: string) => encodeURIComponent(path).replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
export function attachmentPath(value: string): boolean {
  return value.startsWith("tasks/") && value.length < 800 && value.split("/").every(part => !!part && part !== "." && part !== ".." && !/[\\\x00-\x1f]/.test(part));
}
export function descriptionAttachments(content: string) {
  const attachments: DescriptionAttachment[] = [];
  const text = content.replace(/\[附件：([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (whole, name, link) => {
    try {
      const url = new URL(link), path = url.searchParams.get("path") || "";
      if (url.pathname !== "/task-attachment" || !attachmentPath(path)) return whole;
      attachments.push({ name, path, url: `/task-attachment?path=${encodedPath(path)}` });
      return "";
    } catch { return whole; }
  });
  return { text: text.trim(), attachments };
}
export function attachmentMarkdown(origin: string, name: string, path: string) {
  if (!attachmentPath(path)) throw new Error("附件路径无效");
  return `[附件：${name.replace(/[\[\]\r\n]/g, "_")}](${origin}/task-attachment?path=${encodedPath(path)})`;
}
