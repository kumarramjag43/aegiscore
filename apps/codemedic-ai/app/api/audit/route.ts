import { codeSecurityPack, createAuditSseStream, readByok } from "@aegiscore/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_INPUT = Number.parseInt(process.env.AEGIS_MAX_INPUT_CHARS ?? "", 10) || 200_000;

export async function POST(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const body = (payload ?? {}) as Record<string, unknown>;
  const input = body.input;
  const title = typeof body.title === "string" ? body.title.slice(0, 160) : "";

  if (typeof input !== "string" || input.trim().length === 0) {
    return Response.json({ error: "Provide code or an API snippet to audit." }, { status: 400 });
  }

  // Optional BYOK: a key pasted in the browser arrives as a request header and
  // is used for this run only. It is never stored, logged, or echoed back.
  const byok = readByok(request.headers, process.env);
  if (byok.kind === "invalid") {
    return Response.json({ error: byok.reason }, { status: 400 });
  }

  const stream = createAuditSseStream({
    pack: codeSecurityPack,
    input,
    title,
    env: byok.kind === "ok" ? byok.config.env : process.env,
    redact: byok.kind === "ok" ? byok.config.redact : undefined,
    maxInputChars: MAX_INPUT,
    signal: request.signal,
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
