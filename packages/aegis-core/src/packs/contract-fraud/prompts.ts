import type { AgentStage, PipelineContext, PromptPair } from "../../types";

const MAX_PROMPT_CHARS = 24_000;

function fence(content: string): string {
  const clipped =
    content.length > MAX_PROMPT_CHARS
      ? `${content.slice(0, MAX_PROMPT_CHARS)}\n… truncated at ${MAX_PROMPT_CHARS} characters …`
      : content;
  return ["```", clipped, "```"].join("\n");
}

const SCAN_SCHEMA = `{
  "summary": "one paragraph describing the instrument",
  "chunks": [
    { "id": "clause-1", "label": "clause title", "kind": "clause|preamble|invoice-line|schedule", "startLine": 1, "endLine": 4, "content": "verbatim clause text" }
  ],
  "stats": { "clauses": 0, "parties": 0, "currency": "USD" }
}`;

const CRITIC_SCHEMA = `{
  "verdict": "one sentence commercial verdict",
  "riskScore": 0,
  "findings": [
    {
      "id": "F-01",
      "title": "concise red flag",
      "score": 0,
      "category": "Liability|Payment fraud|Financing|Intellectual property|Term|Pricing|Penalties|Termination|Disputes|Data protection|Invoice fraud",
      "location": "Clause 4.2",
      "evidence": "the exact sentence from the document",
      "explanation": "why this creates commercial or legal exposure",
      "recommendation": "the balanced replacement position"
    }
  ],
  "exposure": { "low": 0, "high": 0, "currency": "USD", "basis": "how the figure was derived" }
}`;

const HEAL_SCHEMA = `{
  "strategy": "one sentence describing the redline approach",
  "patches": [
    {
      "id": "P-01",
      "findingId": "F-01",
      "title": "Redline Clause 4.2",
      "rationale": "why the new language is balanced",
      "original": "exact clause text removed",
      "replacement": "exact replacement clause language"
    }
  ],
  "repairedDocument": "the COMPLETE counter-proposal and audit notice, ready to send"
}`;

export const legalPrompts: Record<AgentStage, (ctx: Partial<PipelineContext>) => PromptPair> = {
  scanner: (ctx) => ({
    system: [
      "You are AegisCore Scanner, agent 1 of 4, reading a contract, invoice or credit agreement.",
      "Segment the instrument into clauses, preamble and invoice lines with exact 1-based line numbers.",
      "Copy text verbatim. Never invent clauses.",
      "Return ONLY a JSON object matching this schema:",
      SCAN_SCHEMA,
    ].join("\n"),
    user: [`Instrument: ${ctx.title ?? "agreement"}`, "", fence(ctx.input ?? ""), "", "Return the JSON object now."].join(
      "\n",
    ),
  }),

  critic: (ctx) => ({
    system: [
      "You are the Risk & Anomaly Critic, agent 2 of 4, for commercial and financial documents.",
      "Detect: uncapped liability, one-way indemnities, perpetual data licences, auto-renewal traps,",
      "unilateral pricing, penalty interest, acceleration and cross-default, prepayment penalties,",
      "one-sided termination, jury waivers, bank-detail changes, duplicate or unreconciled invoices,",
      "and VAT or total arithmetic that does not add up.",
      "Score each finding 0-100 by real financial exposure. Quote evidence verbatim and cite the clause.",
      "Quantify exposure only from numbers present in the document.",
      "Return ONLY a JSON object matching this schema:",
      CRITIC_SCHEMA,
    ].join("\n"),
    user: [
      `Instrument: ${ctx.title ?? "agreement"}`,
      "",
      "Scanner output:",
      fence(JSON.stringify(ctx.scan ?? {}, null, 2)),
      "",
      "Document:",
      fence(ctx.input ?? ""),
      "",
      "Return the JSON object now.",
    ].join("\n"),
  }),

  healer: (ctx) => ({
    system: [
      "You are the Auto-Healer, agent 3 of 4, acting as a commercial contracts counsel.",
      "Produce a counter-proposal and audit notice with a reservation of rights.",
      "Each patch replaces one unfair clause with balanced, market-standard language; keep the commercial",
      "intent but cap liability, make rights mutual, and require dual authorisation for payment changes.",
      "`repairedDocument` must be the complete, sendable counter-document. No placeholders.",
      "Return ONLY a JSON object matching this schema:",
      HEAL_SCHEMA,
    ].join("\n"),
    user: [
      `Instrument: ${ctx.title ?? "agreement"}`,
      "",
      "Findings:",
      fence(JSON.stringify(ctx.critique?.findings ?? [], null, 2)),
      "",
      "Exposure:",
      fence(JSON.stringify(ctx.critique?.exposure ?? {}, null, 2)),
      "",
      "Document:",
      fence(ctx.input ?? ""),
      "",
      "Return the JSON object now.",
    ].join("\n"),
  }),

  verifier: (ctx) => ({
    system: [
      "You are the Verifier, agent 4 of 4, for legal redlines.",
      "Confirm the counter-document caps liability, restores mutual termination, keeps payment protected,",
      "and contains no residual unfair clause. Cite failed checks as failed.",
      'Return ONLY JSON: { "notes": ["..."] }',
    ].join("\n"),
    user: [
      `Instrument: ${ctx.title ?? "agreement"}`,
      "",
      "Deterministic checks:",
      fence(JSON.stringify(ctx.checks ?? [], null, 2)),
      "",
      "Counter-document:",
      fence(ctx.heal?.repairedDocument ?? ""),
      "",
      "Return the JSON object now.",
    ].join("\n"),
  }),
};
