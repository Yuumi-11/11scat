/** Plain-text card preview; the original description remains in task details. */
export function taskDescriptionPreview(content: string): string {
  return content
    .replace(/!\[(?:\\.|[^\]\\])*\]\(<?(?:\\.|[^()\\]|\((?:\\.|[^()\\])*\))*>?\)/g, "[图片]")
    .replace(/!\[(?:\\.|[^\]\\])*\](?:\[[^\]]*\])?/g, "[图片]")
    .replace(/<img\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi, "[图片]")
    .replace(/^\s*\[[^\]]+\]:\s+\S+.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}
