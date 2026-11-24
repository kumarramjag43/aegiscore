import type { Env } from "./types";

/**
 * Bring-your-own-key (BYOK) support.
 *
 * A judge can paste a provider key in the browser for one session; the app
 * forwards it as a request header and this module turns it into an env overlay
 * for the existing provider clients. Nothing here persists a key server-side,
 * and every key is registered for redaction before it can reach a log or stream.
 */

export const BYOK_KEY_HEADER = "x-aegis-api-key";
export const BYOK_PROVIDER_HEADER = "x-aegis-provider";

export const BYOK_MIN_KEY = 8;
export const BYOK_MAX_KEY = 512;

export const BYOK_PROVIDERS = ["gemini", "openai", "groq", "anthropic"] as const;
export type ByokProvider = (typeof BYOK_PROVIDERS)[number];

const KEY_ENV: Record<ByokProvider, string> = {
  gemini: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
  groq: "GROQ_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
};

export const BYOK_LABEL: Record<ByokProvider, string> = {
  gemini: "Gemini",
  openai: "OpenAI",
  groq: "Groq",
  anthropic: "Claude",
};

/** Printable ASCII only: keys never contain whitespace or control characters. */
const KEY_SHAPE = /^[\x21-\x7e]+$/;

/** Minimal structural type so this module works with `Headers` and plain objects. */
export interface HeaderSource {
  get(name: string): string | null;
}

/** Minimal structural type so the UIs can pass `window.sessionStorage`. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ByokConfig {
  provider: ByokProvider;
  label: string;
  apiKey: string;
  /** Env overlay for `resolveLlmClient`: the request key outranks server config. */
  env: Env;
  /** Values that must never appear in a log, stream frame or error message. */
  redact: string[];
}

export type ByokValidation =
  | { ok: true; provider: ByokProvider; apiKey: string; label: string }
  | { ok: false; reason: string };

export type ByokResult =
  | { kind: "none" }
  | { kind: "invalid"; reason: string }
  | { kind: "ok"; config: ByokConfig };

export function isByokProvider(value: string): value is ByokProvider {
  return (BYOK_PROVIDERS as readonly string[]).includes(value);
}

/** Prefix inference keeps the header optional when the key shape is unambiguous. */
export function inferByokProvider(apiKey: string): ByokProvider | null {
  if (apiKey.startsWith("AIza")) return "gemini";
  if (apiKey.startsWith("gsk_")) return "groq";
  if (apiKey.startsWith("sk-ant")) return "anthropic";
  if (apiKey.startsWith("sk-")) return "openai";
  return null;
}

export function validateByok(
  provider: string | null | undefined,
  apiKey: string | null | undefined,
): ByokValidation {
  const key = (apiKey ?? "").trim();
  if (key.length === 0) return { ok: false, reason: "Paste an API key first." };
  if (key.length < BYOK_MIN_KEY || key.length > BYOK_MAX_KEY) {
    return {
      ok: false,
      reason: `Keys are ${BYOK_MIN_KEY}–${BYOK_MAX_KEY} characters; this one is ${key.length}.`,
    };
  }
  if (!KEY_SHAPE.test(key)) {
    return { ok: false, reason: "The key contains whitespace or non-printable characters." };
  }

  const requested = (provider ?? "").trim().toLowerCase();
  const resolved = requested ? (isByokProvider(requested) ? requested : null) : inferByokProvider(key);
  if (!resolved) {
    return {
      ok: false,
      reason: requested
        ? `Unknown provider "${requested}". Use gemini, openai or groq.`
        : "Could not tell which provider this key belongs to — choose one explicitly.",
    };
  }
  return { ok: true, provider: resolved, apiKey: key, label: BYOK_LABEL[resolved] };
}

/**
 * Overlay for `resolveLlmClient`. `DEMO_MODE` is cleared because a key the user
 * just supplied is an explicit request for live inference, and `AEGIS_PROVIDER`
 * pins the choice so a server-side key for a different provider cannot win.
 */
export function byokEnv(provider: ByokProvider, apiKey: string, baseEnv: Env = {}): Env {
  return {
    ...baseEnv,
    DEMO_MODE: "false",
    AEGIS_PROVIDER: provider,
    [KEY_ENV[provider]]: apiKey,
  };
}

export function readByok(headers: HeaderSource, baseEnv: Env = {}): ByokResult {
  const rawKey = headers.get(BYOK_KEY_HEADER);
  const rawProvider = headers.get(BYOK_PROVIDER_HEADER);

  if ((rawKey ?? "").trim().length === 0) {
    if ((rawProvider ?? "").trim().length > 0) {
      return { kind: "invalid", reason: "Send the key in x-aegis-api-key together with x-aegis-provider." };
    }
    return { kind: "none" };
  }

  const validation = validateByok(rawProvider, rawKey);
  if (!validation.ok) return { kind: "invalid", reason: validation.reason };

  return {
    kind: "ok",
    config: {
      provider: validation.provider,
      label: validation.label,
      apiKey: validation.apiKey,
      env: byokEnv(validation.provider, validation.apiKey, baseEnv),
      redact: [validation.apiKey],
    },
  };
}

/* ------------------------------------------------------- browser-side helpers */

export interface StoredByok {
  provider: ByokProvider;
  apiKey: string;
}

export function byokRequestHeaders(stored: StoredByok): Record<string, string> {
  return { [BYOK_KEY_HEADER]: stored.apiKey, [BYOK_PROVIDER_HEADER]: stored.provider };
}

/** Read a session-scoped key, discarding anything that no longer validates. */
export function loadStoredByok(storage: StorageLike | null, storageKey: string): StoredByok | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { provider?: unknown; apiKey?: unknown };
    const validation = validateByok(
      typeof parsed.provider === "string" ? parsed.provider : null,
      typeof parsed.apiKey === "string" ? parsed.apiKey : null,
    );
    return validation.ok ? { provider: validation.provider, apiKey: validation.apiKey } : null;
  } catch {
    return null;
  }
}

export function saveStoredByok(
  storage: StorageLike | null,
  storageKey: string,
  value: StoredByok,
): void {
  if (!storage) return;
  try {
    storage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private mode, quota); the key still works for this run.
  }
}

export function clearStoredByok(storage: StorageLike | null, storageKey: string): void {
  if (!storage) return;
  try {
    storage.removeItem(storageKey);
  } catch {
    // Nothing to clean up.
  }
}
