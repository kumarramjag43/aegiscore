import type {
  CritiqueResult,
  DomainPack,
  HealResult,
  PipelineContext,
  ScanResult,
  SourceChunk,
  VerificationCheck,
} from "../../types";
import { analyzeLegal, healFromAnalysis, parseClauses } from "./detectors";
import { legalPrompts } from "./prompts";
import { LEGAL_PRESETS } from "./samples";

function subjectOf(input: string): string {
  const first = input
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 3);
  return (first ?? "Untitled agreement").slice(0, 120);
}

function scan(input: string): ScanResult {
  const clauses = parseClauses(input);
  const chunks: SourceChunk[] = clauses.slice(0, 40).map((clause) => ({
    id: clause.id,
    label: clause.title || clause.location,
    kind: "clause",
    startLine: input.slice(0, input.indexOf(clause.text.split("\n")[0] ?? "")).split("\n").length,
    content: clause.text.slice(0, 4000),
  }));

  const stats = {
    clauses: clauses.length,
    characters: input.length,
    currency: /€/.test(input) ? "EUR" : /£/.test(input) ? "GBP" : "USD",
    amounts: (input.match(/(?:USD|US\$|EUR|GBP|\$|€|£)\s?[\d,]+/g) ?? []).length,
  };

  const summary =
    clauses.length === 0
      ? "No clause structure was detected in this instrument."
      : `Segmented the instrument into ${clauses.length} clause(s) with ${stats.amounts} quantified amount(s).`;

  return { summary, chunks, stats };
}

function critique(input: string, _scan: ScanResult): CritiqueResult {
  const analysis = analyzeLegal(input, subjectOf(input));
  const top = analysis.findings[0];

  const verdict =
    analysis.findings.length === 0
      ? "No red flag matched the commercial rule set. Manual counsel review is still recommended."
      : `${analysis.findings.length} red flag(s) detected. Highest severity: ${top?.severity.toUpperCase() ?? "INFO"} (${top?.score ?? 0}/100) — "${top?.title ?? "unknown"}" at ${top?.location ?? "an unlocated clause"}.`;

  return {
    verdict,
    findings: analysis.findings,
    criticScore: top?.score ?? 0,
    exposure: analysis.exposure,
  };
}

function heal(input: string, _scan: ScanResult, _critique: CritiqueResult, title?: string): HealResult {
  return healFromAnalysis(analyzeLegal(input, title?.trim() || subjectOf(input)));
}

function verify(ctx: PipelineContext): VerificationCheck[] {
  const counter = ctx.heal.repairedDocument;
  const hasCurrency = /(?:\$|€|£|USD|EUR|GBP)/.test(ctx.input);
  // The counter-document indents redlines for readability, so compare content
  // rather than raw bytes.
  const squash = (value: string): string =>
    value
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join("\n");
  const flatCounter = squash(counter);
  const missingRedlines = ctx.heal.patches.filter(
    (patch) => !flatCounter.includes(squash(patch.replacement)),
  );

  return [
    {
      id: "legal.liability.cap",
      label: "Counter-document caps liability",
      passed: /aggregate liability[\s\S]{0,140}(?:shall not exceed|is limited to)/i.test(counter),
      detail: /aggregate liability[\s\S]{0,140}(?:shall not exceed|is limited to)/i.test(counter)
        ? "A mutual aggregate liability cap is present."
        : "No enforceable liability cap was found in the counter-document.",
    },
    {
      id: "legal.mutual.termination",
      label: "Termination is mutual and time-bound",
      passed: /(?:either party|each party)[^.]{0,90}terminat[^.]{0,90}(?:thirty \(30\)|30)\s*days/i.test(counter),
      detail: /(?:either party|each party)[^.]{0,90}terminat[^.]{0,90}(?:thirty \(30\)|30)\s*days/i.test(counter)
        ? "Either party may terminate on 30 days' notice."
        : "The counter-document still lacks a mutual 30-day termination right.",
    },
    {
      id: "legal.payment.protection",
      label: "Payment instructions are protected",
      passed: /(?:bank details|account)[^.]{0,160}(?:dual authorisation|call-back|verified|written confirmation)/i.test(
        counter,
      ),
      detail: /(?:bank details|account)[^.]{0,160}(?:dual authorisation|call-back|verified|written confirmation)/i.test(
        counter,
      )
        ? "Changes of bank details require out-of-band verification."
        : "No verification requirement for bank-detail changes was found.",
    },
    {
      id: "legal.reservation.of.rights",
      label: "Notice reserves the counterparty's rights",
      passed: /reservation of rights/i.test(counter),
      detail: /reservation of rights/i.test(counter)
        ? "The audit notice is issued without prejudice with a reservation of rights."
        : "The notice does not reserve rights.",
    },
    {
      id: "legal.redlines.applied",
      label: "Every redline appears in the counter-document",
      passed: missingRedlines.length === 0,
      detail:
        missingRedlines.length === 0
          ? `All ${ctx.heal.patches.length} redline(s) are present verbatim.`
          : `Missing: ${missingRedlines.map((patch) => patch.id).join(", ")}.`,
    },
    {
      id: "legal.exposure.quantified",
      label: "Financial exposure is quantified",
      passed: !hasCurrency || Boolean(ctx.critique.exposure),
      detail: ctx.critique.exposure
        ? `Exposure derived from the document: ${ctx.critique.exposure.currency} ${ctx.critique.exposure.low.toLocaleString("en-US")}–${ctx.critique.exposure.high.toLocaleString("en-US")}.`
        : hasCurrency
          ? "The document contains amounts but no exposure could be derived."
          : "No monetary amounts in the document; quantification is not applicable.",
    },
    {
      id: "legal.clauses.segmented",
      label: "Clause structure was segmented",
      passed: ctx.scan.chunks.length >= 2,
      detail: `${ctx.scan.chunks.length} clause chunk(s) parsed.`,
    },
  ];
}

export const contractFraudPack: DomainPack = {
  id: "contract-fraud",
  label: "Contract & Financial Fraud",
  documentNoun: "agreement",
  actionLabel: "Run fraud audit",
  agents: {
    scanner: {
      stage: "scanner",
      name: "Clause Scanner",
      role: "Segments the instrument into numbered clauses, preamble and invoice lines.",
      accent: "#38bdf8",
    },
    critic: {
      stage: "critic",
      name: "Fraud Critic",
      role: "Scores commercial, financial and documentary red flags against real exposure.",
      accent: "#f59e0b",
    },
    healer: {
      stage: "healer",
      name: "Redline Drafter",
      role: "Drafts balanced counter-language and assembles the counter-proposal notice.",
      accent: "#10b981",
    },
    verifier: {
      stage: "verifier",
      name: "Counsel Verifier",
      role: "Confirms caps, mutual termination and payment protection are actually present.",
      accent: "#818cf8",
    },
  },
  presets: LEGAL_PRESETS,
  prompts: legalPrompts,
  sandbox: { scan, critique, heal },
  verify,
};
