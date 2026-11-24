import type { DomainPack, Env, LlmClient, ProviderInfo } from "../types";
import { createAnthropicClient } from "./anthropic";
import { createSandboxClient } from "./demo";
import { createGeminiClient } from "./gemini";
import { createOpenAiCompatibleClient } from "./openai";

export { createSandboxClient } from "./demo";
export { ProviderError } from "./http";

const DEFAULT_TIMEOUT_MS = 45_000;
const MIN_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 120_000;

function timeoutFromEnv(env: Env): number {
  const parsed = Number.parseInt(env.AEGIS_LLM_TIMEOUT_MS ?? "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, parsed));
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export interface ProviderCandidate extends ProviderInfo {
  model: string;
  configured: boolean;
}

/** Static inventory for the /api/health badge — no network calls, no key values. */
export function describeProviders(env: Env): ProviderCandidate[] {
  return [
    {
      id: "openai",
      label: "OpenAI",
      mode: "live",
      model: nonEmpty(env.OPENAI_MODEL) ?? "gpt-4o-mini",
      configured: Boolean(nonEmpty(env.OPENAI_API_KEY)),
    },
    {
      id: "gemini",
      label: "Google Gemini",
      mode: "live",
      model: nonEmpty(env.GEMINI_MODEL) ?? "gemini-2.0-flash",
      configured: Boolean(nonEmpty(env.GEMINI_API_KEY) ?? nonEmpty(env.GOOGLE_API_KEY)),
    },
    {
      id: "groq",
      label: "Groq",
      mode: "live",
      model: nonEmpty(env.GROQ_MODEL) ?? "llama-3.3-70b-versatile",
      configured: Boolean(nonEmpty(env.GROQ_API_KEY)),
    },
    {
      id: "anthropic",
      label: "Anthropic Claude",
      mode: "live",
      model: nonEmpty(env.ANTHROPIC_MODEL) ?? "claude-sonnet-4-20250514",
      configured: Boolean(nonEmpty(env.ANTHROPIC_API_KEY)),
    },
    { id: "sandbox", label: "Aegis Sandbox", mode: "sandbox", model: "deterministic", configured: true },
  ];
}

/**
 * Pick the LLM client for this request.
 *
 * Precedence: explicit `AEGIS_PROVIDER` → first configured provider in
 * openai/gemini/groq/anthropic order → deterministic sandbox. A misconfigured
 * request never fails the demo: it degrades to sandbox and the UI shows the
 * active provider from the `run.started` event.
 */
/** `DEMO_MODE=1|true|yes|on` pins every run to the deterministic sandbox. */
export function isDemoMode(env: Env): boolean {
  const flag = nonEmpty(env.DEMO_MODE)?.toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes" || flag === "on";
}

export function resolveLlmClient(env: Env, pack: DomainPack): LlmClient {
  const timeoutMs = timeoutFromEnv(env);
  if (isDemoMode(env)) return createSandboxClient(pack);
  const requested = nonEmpty(env.AEGIS_PROVIDER)?.toLowerCase();

  const build = (id: string): LlmClient | null => {
    switch (id) {
      case "openai": {
        const apiKey = nonEmpty(env.OPENAI_API_KEY);
        if (!apiKey) return null;
        const model = nonEmpty(env.OPENAI_MODEL) ?? "gpt-4o-mini";
        return createOpenAiCompatibleClient({
          id: "openai",
          label: `OpenAI · ${model}`,
          apiKey,
          model,
          baseUrl: nonEmpty(env.OPENAI_BASE_URL) ?? "https://api.openai.com/v1",
          timeoutMs,
          jsonMode: true,
        });
      }
      case "gemini": {
        const apiKey = nonEmpty(env.GEMINI_API_KEY) ?? nonEmpty(env.GOOGLE_API_KEY);
        if (!apiKey) return null;
        const model = nonEmpty(env.GEMINI_MODEL) ?? "gemini-2.0-flash";
        return createGeminiClient({ apiKey, model, timeoutMs });
      }
      case "groq": {
        const apiKey = nonEmpty(env.GROQ_API_KEY);
        if (!apiKey) return null;
        const model = nonEmpty(env.GROQ_MODEL) ?? "llama-3.3-70b-versatile";
        return createOpenAiCompatibleClient({
          id: "groq",
          label: `Groq · ${model}`,
          apiKey,
          model,
          baseUrl: nonEmpty(env.GROQ_BASE_URL) ?? "https://api.groq.com/openai/v1",
          timeoutMs,
        });
      }
      case "anthropic": {
        const apiKey = nonEmpty(env.ANTHROPIC_API_KEY);
        if (!apiKey) return null;
        const model = nonEmpty(env.ANTHROPIC_MODEL) ?? "claude-sonnet-4-20250514";
        return createAnthropicClient({ apiKey, model, timeoutMs });
      }
      case "demo":
      case "sandbox":
        return createSandboxClient(pack);
      default:
        return null;
    }
  };

  if (requested) {
    const client = build(requested);
    if (client) return client;
  }

  for (const id of ["openai", "gemini", "groq", "anthropic"]) {
    const client = build(id);
    if (client) return client;
  }

  return createSandboxClient(pack);
}
