import type { LlmClient, LlmRequest } from "../types";
import { ProviderError, postJson } from "./http";

interface AnthropicBlock {
  type?: string;
  text?: string;
}

interface AnthropicResponse {
  content?: AnthropicBlock[];
  stop_reason?: string;
}

export interface AnthropicClientConfig {
  apiKey: string;
  model: string;
  timeoutMs: number;
}

const ANTHROPIC_VERSION = "2023-06-01";

export function createAnthropicClient(config: AnthropicClientConfig): LlmClient {
  return {
    id: "anthropic",
    label: `Claude · ${config.model}`,
    mode: "live",
    async complete(request: LlmRequest): Promise<string> {
      const data = await postJson<AnthropicResponse>({
        url: "https://api.anthropic.com/v1/messages",
        headers: {
          "x-api-key": config.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: {
          model: config.model,
          max_tokens: 4096,
          temperature: 0.2,
          system: request.system,
          messages: [{ role: "user", content: request.user }],
        },
        timeoutMs: config.timeoutMs,
        signal: request.signal,
      });

      const text = (data.content ?? [])
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("")
        .trim();

      if (text.length === 0) throw new ProviderError("Claude returned an empty completion.");
      return text;
    },
  };
}
