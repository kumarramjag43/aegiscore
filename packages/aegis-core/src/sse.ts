import type { AgentEvent, AgentStage } from "./types";

export interface SseStreamOptions {
  signal?: AbortSignal;
  /** Comment frames keep proxies from closing an idle connection. */
  keepAliveMs?: number;
}

/**
 * Framework-agnostic SSE encoder. Both Next.js apps wrap the returned
 * ReadableStream in a `Response`; nothing here depends on Next or Node APIs.
 */
export function createSseStream(
  events: AsyncIterable<AgentEvent>,
  options: SseStreamOptions = {},
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const keepAliveMs = options.keepAliveMs ?? 15_000;
  let timer: ReturnType<typeof setInterval> | undefined;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Consumer disconnected mid-frame; cancellation handles cleanup.
        }
      };

      write("retry: 3000\n\n");
      timer = setInterval(() => write(": keep-alive\n\n"), keepAliveMs);

      try {
        for await (const event of events) {
          if (options.signal?.aborted) break;
          write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const payload = { type: "run.failed", message, at: Date.now() };
        write(`event: run.failed\ndata: ${JSON.stringify(payload)}\n\n`);
      } finally {
        if (timer) clearInterval(timer);
        try {
          controller.close();
        } catch {
          // Already closed by the consumer.
        }
      }
    },
    cancel() {
      if (timer) clearInterval(timer);
    },
  });
}

export const STAGE_ORDER: AgentStage[] = ["scanner", "critic", "healer", "verifier"];
