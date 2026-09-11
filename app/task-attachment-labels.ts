const imageTypes: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', svg: 'image/svg+xml' };

export function imageAttachmentExtension(name: string, type = ''): string | null {
  const extension = name.split('.').pop()?.toLowerCase() || '';
  if (Object.hasOwn(imageTypes, extension)) return extension;
  return Object.keys(imageTypes).find(key => imageTypes[key] === type.toLowerCase()) || null;
}

export function imageAttachmentType(name: string): string | null {
  const extension = imageAttachmentExtension(name);
  return extension ? imageTypes[extension] : null;
}

export function attachmentDisplayNames(files: readonly { name: string }[], preserveImageNumbers = false): string[] {
  let image = 0;
  return files.map(file => {
    const extension = imageAttachmentExtension(file.name);
    if (!extension) return file.name;
    image++;
    const existing = preserveImageNumbers && /^图([1-9]\d*)\./.exec(file.name);
    return `图${existing ? existing[1] : image}.${extension}`;
  });
}

export function pastedAttachmentName(file: { name: string; type: string }, existing: readonly { name: string }[]): string {
  const extension = imageAttachmentExtension(file.name, file.type);
  if (!extension) return file.name || '粘贴文件';
  const last = existing.reduce((max, item) => Math.max(max, Number(/^图(\d+)\./.exec(item.name)?.[1] || 0)), 0);
  const count = existing.filter(item => imageAttachmentExtension(item.name)).length;
  return `图${Math.max(last, count) + 1}.${extension}`;
}

export function insertAttachmentPlaceholders(value: string, start: number, end: number, names: readonly string[]) {
  const inserted = names.map(name => `[${name}]`).join(' ');
  return { value: value.slice(0, start) + inserted + value.slice(end), cursor: start + inserted.length };
}
