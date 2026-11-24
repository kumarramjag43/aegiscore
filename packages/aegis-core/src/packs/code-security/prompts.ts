import type { AgentStage, PipelineContext, PromptPair } from "../../types";

const MAX_PROMPT_CHARS = 24_000;

function fence(content: string): string {
  const clipped =
    content.length > MAX_PROMPT_CHARS
      ? `${content.slice(0, MAX_PROMPT_CHARS)}\n// … truncated at ${MAX_PROMPT_CHARS} characters …`
      : content;
  return ["```", clipped, "```"].join("\n");
}

const SCAN_SCHEMA = `{
  "summary": "one paragraph describing what this file does",
  "chunks": [
    { "id": "chunk-1", "label": "short label", "kind": "import|route|function|config|statement", "startLine": 1, "endLine": 12, "content": "verbatim lines" }
  ],
  "stats": { "lines": 0, "routes": 0, "functions": 0 }
}`;

const CRITIC_SCHEMA = `{
  "verdict": "one sentence risk verdict",
  "riskScore": 0,
  "findings": [
    {
      "id": "F-01",
      "title": "concise vulnerability name",
      "score": 0,
      "category": "Injection|Secrets|Authentication|Authorization|Concurrency|Cryptography|Configuration|XSS|Data exposure",
      "location": "Line 42",
      "evidence": "the exact offending line, verbatim",
      "explanation": "why this is exploitable, two sentences maximum",
      "recommendation": "the specific fix"
    }
  ]
}`;

const HEAL_SCHEMA = `{
  "strategy": "one sentence describing the remediation approach",
  "patches": [
    {
      "id": "P-01",
      "findingId": "F-01",
      "title": "short patch title",
      "rationale": "why this change closes the finding",
      "original": "exact text removed",
      "replacement": "exact text inserted"
    }
  ],
  "repairedDocument": "the COMPLETE corrected file"
}`;

export const codePrompts: Record<AgentStage, (ctx: Partial<PipelineContext>) => PromptPair> = {
  scanner: (ctx) => ({
    system: [
      "You are AegisCore Scanner, agent 1 of 4 in a security audit pipeline.",
      "Split the source into logical chunks (imports, routes, functions, config blocks).",
      "Copy content verbatim and attach exact 1-based line numbers. Never invent code.",
      "Return ONLY a JSON object matching this schema:",
      SCAN_SCHEMA,
    ].join("\n"),
    user: [
      `Audit target: ${ctx.title ?? "source file"}`,
      "",
      fence(ctx.input ?? ""),
      "",
      "Return the JSON object now.",
    ].join("\n"),
  }),

  critic: (ctx) => ({
    system: [
      "You are the Risk & Anomaly Critic, agent 2 of 4.",
      "Find real, exploitable weaknesses: injection, hardcoded secrets, broken auth, race conditions,",
      "weak crypto, permissive CORS, XSS sinks, secret logging and error leakage.",
      "Give each finding an intrinsic 0-100 score (90+ actively exploitable, 60-89 serious, <60 hardening).",
      "Quote `evidence` verbatim from the source and anchor `location` to a line number.",
      "Do not report style issues. Do not invent code that is not in the input.",
      "Return ONLY a JSON object matching this schema:",
      CRITIC_SCHEMA,
    ].join("\n"),
    user: [
      `Audit target: ${ctx.title ?? "source file"}`,
      "",
      "Scanner output:",
      fence(JSON.stringify(ctx.scan ?? {}, null, 2)),
      "",
      "Source:",
      fence(ctx.input ?? ""),
      "",
      "Return the JSON object now.",
    ].join("\n"),
  }),

  healer: (ctx) => ({
    system: [
      "You are the Auto-Healer, agent 3 of 4.",
      "Rewrite the file so every finding is closed while preserving all unrelated code byte-for-byte.",
      "Rules: use bound parameters for SQL, read secrets from process.env, verify JWT signatures,",
      "make shared-state updates atomic, and never leave TODO/FIXME/placeholder markers.",
      "`repairedDocument` must contain the complete, compilable file.",
      "Return ONLY a JSON object matching this schema:",
      HEAL_SCHEMA,
    ].join("\n"),
    user: [
      `Audit target: ${ctx.title ?? "source file"}`,
      "",
      "Findings:",
      fence(JSON.stringify(ctx.critique?.findings ?? [], null, 2)),
      "",
      "Original source:",
      fence(ctx.input ?? ""),
      "",
      "Return the JSON object now.",
    ].join("\n"),
  }),

  verifier: (ctx) => ({
    system: [
      "You are the Verifier, agent 4 of 4.",
      "You receive deterministic check results and the remediation. Write 2-4 short notes about residual risk.",
      "Do not claim a check passed if it is listed as failed.",
      'Return ONLY JSON: { "notes": ["..."] }',
    ].join("\n"),
    user: [
      `Audit target: ${ctx.title ?? "source file"}`,
      "",
      "Deterministic checks:",
      fence(JSON.stringify(ctx.checks ?? [], null, 2)),
      "",
      "Remediation:",
      fence(ctx.heal?.repairedDocument ?? ""),
      "",
      "Return the JSON object now.",
    ].join("\n"),
  }),
};
