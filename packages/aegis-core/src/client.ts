import type { AgentEvent } from "./types";

/**
 * Browser-side helpers shared by both apps.
 *
 * Nothing here runs at import time, so importing this module from a server
 * component is harmless.
 */

/** Read an SSE response body and dispatch each `data:` frame as an event. */
export async function consumeEventStream(
  response: Response,
  onEvent: (event: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!response.body) throw new Error("This browser cannot stream responses.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const dispatch = (frame: string): void => {
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("");
    if (data.length === 0) return;
    try {
      onEvent(JSON.parse(data) as AgentEvent);
    } catch {
      // A malformed frame must never break the stream.
    }
  };

  try {
    for (;;) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        dispatch(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");
      }
    }
    if (buffer.trim().length > 0) dispatch(buffer);
  } finally {
    reader.releaseLock();
  }
}

/** Trigger a client-side download of generated text. */
export function downloadTextFile(filename: string, content: string, mime = "text/plain"): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }
  try {
    const area = document.createElement("textarea");
    area.value = value;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------- file uploads */

export interface UploadRule {
  /** Lower-case extensions, including the dot: `[".ts", ".py"]`. */
  extensions: string[];
  maxBytes?: number;
}

export interface UploadedText {
  ok: boolean;
  name: string;
  text: string;
  bytes: number;
  error?: string;
}

export const DEFAULT_UPLOAD_LIMIT = 512_000;

/**
 * Removes path separators and control characters, forces a single extension,
 * and falls back when the candidate is not a usable file name. The result is
 * safe to use as a `download` attribute.
 */
export function guessFileName(candidate: string, fallbackExtension: string): string {
  const cleaned = candidate
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 96);
  if (cleaned.length === 0) return `aegis-export${fallbackExtension}`;
  return /\.[a-z0-9]{1,5}$/i.test(cleaned) ? cleaned : `${cleaned}${fallbackExtension}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Validates and reads a dropped or picked text file. Every rejection returns a
 * human sentence instead of throwing, so callers can render it verbatim.
 */
export async function readUploadedText(file: File, rule: UploadRule): Promise<UploadedText> {
  const name = guessFileName(file.name, "");
  const bytes = file.size;
  const limit = rule.maxBytes ?? DEFAULT_UPLOAD_LIMIT;
  const extension = /\.[a-z0-9]{1,5}$/i.exec(name)?.[0].toLowerCase() ?? "";

  if (extension.length === 0 || !rule.extensions.includes(extension)) {
    return {
      ok: false,
      name,
      text: "",
      bytes,
      error: `Unsupported file type. Accepted: ${rule.extensions.join(", ")}.`,
    };
  }
  if (bytes === 0) return { ok: false, name, text: "", bytes, error: "That file is empty." };
  if (bytes > limit) {
    return {
      ok: false,
      name,
      text: "",
      bytes,
      error: `File is ${formatBytes(bytes)} — the limit is ${formatBytes(limit)}.`,
    };
  }

  const raw = (await file.text()).replace(/^\uFEFF/, "");
  if (raw.includes("\u0000")) {
    return { ok: false, name, text: "", bytes, error: "That looks like a binary file, not text." };
  }
  if (raw.trim().length === 0) {
    return { ok: false, name, text: "", bytes, error: "That file has no readable content." };
  }

  return { ok: true, name, text: raw, bytes };
}
