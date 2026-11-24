import type { LlmClient, LlmRequest } from "../types";
import { ProviderError, postJson } from "./http";

interface OpenAiChoice {
  message?: { content?: string | null };
}

interface OpenAiResponse {
  choices?: OpenAiChoice[];
}

export interface OpenAiClientConfig {
  id: string;
  label: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  /** Only OpenAI (and some Groq models) accept `response_format: json_object`. */
  jsonMode?: boolean;
}

const DEFAULT_MAX_TOKENS = 4096;

export function createOpenAiCompatibleClient(config: OpenAiClientConfig): LlmClient {
  const endpoint = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  return {
    id: config.id,
    label: config.label,
    mode: "live",
    async complete(request: LlmRequest): Promise<string> {
      const body: Record<string, unknown> = {
        model: config.model,
        temperature: 0.2,
        max_tokens: DEFAULT_MAX_TOKENS,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.user },
        ],
      };
      if (config.jsonMode) body.response_format = { type: "json_object" };

      const data = await postJson<OpenAiResponse>({
        url: endpoint,
        headers: { authorization: `Bearer ${config.apiKey}` },
        body,
        timeoutMs: config.timeoutMs,
        signal: request.signal,
      });

      const text = data.choices?.[0]?.message?.content;
      if (typeof text !== "string" || text.trim().length === 0) {
        throw new ProviderError(`${config.label} returned an empty completion.`);
      }
      return text;
    },
  };
}
