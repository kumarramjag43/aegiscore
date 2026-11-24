import type { LlmClient, LlmRequest } from "../types";
import { ProviderError, postJson } from "./http";

interface GeminiPart {
  text?: string;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
  promptFeedback?: { blockReason?: string };
}

export interface GeminiClientConfig {
  apiKey: string;
  model: string;
  timeoutMs: number;
}

/** Gemini keys travel in the `x-goog-api-key` header, never in the URL. */
export function createGeminiClient(config: GeminiClientConfig): LlmClient {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    config.model,
  )}:generateContent`;

  return {
    id: "gemini",
    label: `Gemini · ${config.model}`,
    mode: "live",
    async complete(request: LlmRequest): Promise<string> {
      const data = await postJson<GeminiResponse>({
        url: endpoint,
        headers: { "x-goog-api-key": config.apiKey },
        body: {
          systemInstruction: { parts: [{ text: request.system }] },
          contents: [{ role: "user", parts: [{ text: request.user }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4096,
            responseMimeType: "application/json",
          },
        },
        timeoutMs: config.timeoutMs,
        signal: request.signal,
      });

      if (data.promptFeedback?.blockReason) {
        throw new ProviderError(`Gemini blocked the request (${data.promptFeedback.blockReason}).`);
      }

      const text = (data.candidates?.[0]?.content?.parts ?? [])
        .map((part) => part.text ?? "")
        .join("")
        .trim();

      if (text.length === 0) throw new ProviderError("Gemini returned an empty completion.");
      return text;
    },
  };
}
