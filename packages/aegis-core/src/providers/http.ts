import { redactSecrets } from "../security";

export class ProviderError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable = false) {
    super(message);
    this.name = "ProviderError";
    this.retryable = retryable;
  }
}

export interface PostJsonOptions {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  timeoutMs: number;
  signal?: AbortSignal;
  /** Total attempts, including the first one. */
  attempts?: number;
}

const RETRY_BASE_MS = 400;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new ProviderError("Request cancelled.", false));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Minimal JSON POST with a hard timeout and a single retry on 429/5xx.
 * Credentials live only in `headers`; they are never logged or echoed into
 * error messages.
 */
export async function postJson<T>(options: PostJsonOptions): Promise<T> {
  const attempts = options.attempts ?? 2;
  let lastError: ProviderError = new ProviderError("Request failed.");

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const response = await fetch(options.url, {
        method: "POST",
        headers: { "content-type": "application/json", ...options.headers },
        body: JSON.stringify(options.body),
        signal: controller.signal,
        cache: "no-store",
      });

      if (response.ok) {
        return (await response.json()) as T;
      }

      const retryable = response.status === 429 || response.status >= 500;
      const detail = redactSecrets((await response.text().catch(() => "")).slice(0, 300), 300);
      lastError = new ProviderError(
        `Provider returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
        retryable,
      );
      if (!retryable) throw lastError;
    } catch (error) {
      if (error instanceof ProviderError) {
        lastError = error;
        if (!error.retryable) throw error;
      } else if (controller.signal.aborted) {
        lastError = new ProviderError(`Provider timed out after ${options.timeoutMs} ms.`, true);
      } else {
        lastError = new ProviderError(redactSecrets((error as Error).message || "Network error"), true);
      }
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    }

    if (attempt < attempts) await sleep(RETRY_BASE_MS * attempt, options.signal);
  }

  throw lastError;
}
