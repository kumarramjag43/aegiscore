export type EngineMode = "live" | "sandbox" | "offline";

export interface EngineStatus {
  mode: EngineMode;
  /** Provider label reported by the app's `/api/health`. */
  label: string;
}

/**
 * Ask a deployed app which engine it is running. Never throws: an unreachable
 * app is a normal state for a launch portal, not an error.
 */
export async function probeEngine(baseUrl: string): Promise<EngineStatus> {
  try {
    const url = new URL("/api/health", baseUrl).toString();
    const response = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
      // Cold serverless starts (TLS + first invocation) can take >1.5 s, and a
      // timed-out probe renders as "offline" on the launch page.
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return { mode: "offline", label: `HTTP ${response.status}` };

    const data = (await response.json()) as { active?: { mode?: string; label?: string } };
    const active = data.active;
    if (!active) return { mode: "offline", label: "no provider reported" };

    return { mode: active.mode === "live" ? "live" : "sandbox", label: active.label ?? "unknown" };
  } catch {
    return { mode: "offline", label: "unreachable" };
  }
}
