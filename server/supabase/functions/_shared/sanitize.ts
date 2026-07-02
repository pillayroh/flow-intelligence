// Defense-in-depth: even though clients are supposed to send metadata only,
// the ingest function independently rejects any payload that carries free-text
// content. This keeps the "metadata, never content" guarantee enforceable at
// the trust boundary.

const FORBIDDEN_KEYS = new Set([
  "text",
  "content",
  "prompt",
  "prompt_text",
  "code",
  "diff",
  "command",
  "command_raw",
  "message",
  "body",
  "file_content",
  "contents",
  "snippet",
  "response",
  "thought",
]);

// Any string value longer than this is treated as probable free-text content
// and rejected. Metadata strings (classifications, ids, tool names) are short.
const MAX_STRING_LEN = 200;

export function isCleanPayload(payload: unknown): boolean {
  return check(payload, 0);
}

function check(value: unknown, depth: number): boolean {
  if (depth > 6) return false;
  if (value === null) return true;
  const t = typeof value;
  if (t === "number" || t === "boolean") return true;
  if (t === "string") return (value as string).length <= MAX_STRING_LEN;
  if (Array.isArray(value)) return value.every((v) => check(v, depth + 1));
  if (t === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(k.toLowerCase())) return false;
      if (!check(v, depth + 1)) return false;
    }
    return true;
  }
  return false;
}

export function clampScore(n: unknown): number | null {
  if (typeof n !== "number" || Number.isNaN(n)) return null;
  const i = Math.round(n);
  if (i < 1) return 1;
  if (i > 5) return 5;
  return i;
}

export function isIsoTimestamp(s: unknown): boolean {
  if (typeof s !== "string") return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}
