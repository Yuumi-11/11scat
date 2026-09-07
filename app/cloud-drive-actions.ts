export type CloudItem = { name: string; path: string; kind: "folder" | "file"; size: number; updatedAt: number };
export type CloudStatus = { usedBytes: number; limitBytes: number; warningBytes: number; warning: boolean; percent: number };

export const cloudFileUrl = (path: string) => `/api/cloud/files/${path.split("/").map(encodeURIComponent).join("/")}`;
export const cloudFileSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : bytes < 1073741824 ? `${(bytes / 1048576).toFixed(1)} MB` : `${(bytes / 1073741824).toFixed(1)} GB`;

export function nextFolderName(items: CloudItem[]) {
  const names = new Set(items.map(item => item.name));
  for (let index = 0; ; index++) {
    const name = index ? `新建文件夹 (${index})` : "新建文件夹";
    if (!names.has(name)) return name;
  }
}

export function cloudDropPath(current: string, hovered: string | undefined, items: CloudItem[]) {
  return items.some(item => item.kind === "folder" && item.path === hovered) ? hovered! : current;
}

export function clipboardFiles(data: Pick<DataTransfer, "files" | "items">): File[] {
  const files = Array.from(data.files);
  // Browsers may expose the same files in both lists. Prefer files to avoid duplicates.
  return files.length ? files : Array.from(data.items).filter(item => item.kind === "file").map(item => item.getAsFile()).filter((file): file is File => !!file);
}

export async function runCloudBatch<T>(items: T[], operation: (item: T) => Promise<void>, progress: (done: number, total: number) => void) {
  const succeeded: T[] = [], failed: { item: T; message: string }[] = [];
  for (const item of items) {
    try { await operation(item); succeeded.push(item); }
    catch (error) { failed.push({ item, message: error instanceof Error ? error.message : "操作失败" }); }
    progress(succeeded.length + failed.length, items.length);
  }
  return { succeeded, failed };
}

export async function cloudRequest(url: string, options?: RequestInit) {
  const response = await fetch(url, { ...options, signal: options?.signal || AbortSignal.timeout(15000) });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || `请求失败（${response.status}）`);
  return result;
}

export function uploadCloudFiles(files: File[], destination: string, progress: (done: number, total: number) => void) {
  return runCloudBatch(files, async file => {
    await cloudRequest(`/api/cloud/files?path=${encodeURIComponent(destination)}`, {
      method: "POST", headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name || "粘贴文件") },
      body: file, signal: AbortSignal.timeout(120000),
    });
  }, progress);
}

export function deleteCloudItems(items: CloudItem[], progress: (done: number, total: number) => void) {
  return runCloudBatch(items, async item => {
    await cloudRequest("/api/cloud/files", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: item.path, confirmed: true }) });
  }, progress);
}
