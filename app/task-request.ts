export function taskErrorMessage(cause: unknown, fallback = ''): string {
  const message = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : '';
  return !message || cause instanceof SyntaxError || /(?:Unexpected (?:end|token)|JSON (?:input|parse)|not valid JSON)/i.test(message) ? fallback : message;
}

/** Empty or truncated replies never confirm a mutation, even with HTTP 200. */
export async function readTaskResponse(response: Response, fallback: string) {
  let data;
  try { data = await response.json(); } catch { throw new Error(fallback); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(fallback);
  if (!response.ok) throw new Error(taskErrorMessage(data.error, fallback));
  return data;
}
