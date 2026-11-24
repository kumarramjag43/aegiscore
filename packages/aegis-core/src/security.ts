/**
 * Trust-boundary helpers shared by every provider and route.
 * Nothing here ever logs; it only sanitises what may reach a log or a client.
 */

const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{12,}/g, // OpenAI style
  /sk-ant-[A-Za-z0-9_-]{12,}/g, // Anthropic style
  /gsk_[A-Za-z0-9]{12,}/g, // Groq style
  /AIza[0-9A-Za-z_-]{20,}/g, // Google API key
  /gh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub tokens
  /Bearer\s+[A-Za-z0-9._-]{12,}/gi,
];

/** Remove credential-looking material and bound the length of error text. */
export function redactSecrets(text: string, maxLength = 400): string {
  let output = text;
  for (const pattern of SECRET_PATTERNS) output = output.replace(pattern, "[redacted]");
  return output.length > maxLength ? `${output.slice(0, maxLength - 1)}…` : output;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return redactSecrets(error.message || error.name);
  return redactSecrets(String(error));
}

export interface ClampResult {
  ok: boolean;
  value: string;
  reason?: string;
}

/** Bound request input so a single audit cannot exhaust server memory. */
export function clampInput(raw: unknown, maxChars: number): ClampResult {
  if (typeof raw !== "string") {
    return { ok: false, value: "", reason: "Input must be a text string." };
  }
  const value = raw.replace(/\u0000/g, "").trim();
  if (value.length === 0) {
    return { ok: false, value: "", reason: "Input is empty — paste code or a document to audit." };
  }
  if (value.length > maxChars) {
    return {
      ok: false,
      value: "",
      reason: `Input is ${value.length.toLocaleString()} characters; the limit is ${maxChars.toLocaleString()}.`,
    };
  }
  return { ok: true, value };
}
