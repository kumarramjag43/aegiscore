import { contractFraudPack, describeProviders, isDemoMode, resolveLlmClient } from "@aegiscore/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const active = resolveLlmClient(process.env, contractFraudPack);

  return Response.json(
    {
      ok: true,
      app: "lexguard-ai",
      domain: contractFraudPack.id,
      label: contractFraudPack.label,
      active: { id: active.id, label: active.label, mode: active.mode },
      demoMode: isDemoMode(process.env),
      providers: describeProviders(process.env).map(({ id, label, mode, model, configured }) => ({
        id,
        label,
        mode,
        model,
        configured,
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
