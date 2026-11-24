import { contractFraudPack, describeProviders, resolveLlmClient } from "@aegiscore/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const active = resolveLlmClient(process.env, contractFraudPack);

  return Response.json(
    {
      app: "lexguard-ai",
      domain: contractFraudPack.id,
      label: contractFraudPack.label,
      active: { id: active.id, label: active.label, mode: active.mode },
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
