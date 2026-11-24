/**
 * Defensive helpers for model output.
 *
 * Live LLMs routinely wrap JSON in prose or fences, omit fields, or return
 * numbers as strings. The pipeline must never crash or trust those shapes, so
 * every value is extracted and coerced through these functions.
 */

/** Pull the first balanced JSON object out of arbitrary model text. */
export function extractJsonObject(text: string): unknown {
  if (typeof text !== "string" || text.length === 0) return null;

  const fenced = /```(?:json|JSON)?\s*([\s\S]*?)```/.exec(text);
  const candidates = [fenced?.[1] ?? "", text];

  for (const candidate of candidates) {
    const start = candidate.indexOf("{");
    if (start === -1) continue;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < candidate.length; i += 1) {
      const char = candidate[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(candidate.slice(start, i + 1));
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asString(value: unknown, fallback = "", maxLength = 2000): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (trimmed.length === 0) return fallback;
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}…` : trimmed;
}

export function asNumber(value: unknown, fallback: number, min = 0, max = 100): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed * 100) / 100));
}

export function asArray(value: unknown, limit = 40): unknown[] {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}

/** Clamp free text that will be rendered inside a markdown report. */
export function escapeFence(content: string): string {
  const longest = Math.max(0, ...[...content.matchAll(/`{3,}/g)].map((m) => m[0].length));
  return "`".repeat(Math.max(3, longest + 1));
}

export function countLines(text: string): number {
  return text.length === 0 ? 0 : text.split("\n").length;
}
