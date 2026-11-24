import { asArray, asNumber, asString, isRecord } from "./json";
import { normalizeFinding, scoreToSeverity } from "./scoring";
import type {
  CritiqueResult,
  Finding,
  HealResult,
  MoneyExposure,
  Patch,
  ScanResult,
  SourceChunk,
} from "./types";

const LIMITS = {
  findings: 40,
  patches: 40,
  chunks: 60,
  shortText: 200,
  mediumText: 900,
  longText: 2400,
  evidence: 900,
  document: 200_000,
};

function text(value: unknown, fallback: string, max: number): string {
  return asString(value, fallback, max);
}

function slugId(value: unknown, prefix: string, index: number): string {
  const raw = asString(value, "", 40).replace(/[^A-Za-z0-9_-]/g, "");
  return raw.length > 0 ? raw : `${prefix}-${String(index + 1).padStart(2, "0")}`;
}

export function normalizeScan(raw: unknown): ScanResult | null {
  if (!isRecord(raw)) return null;
  const summary = text(raw.summary, "", LIMITS.mediumText);
  const chunks: SourceChunk[] = [];

  for (const [index, entry] of asArray(raw.chunks, LIMITS.chunks).entries()) {
    if (!isRecord(entry)) continue;
    const content = text(entry.content, "", LIMITS.longText);
    if (content.length === 0) continue;
    chunks.push({
      id: slugId(entry.id, "chunk", index),
      label: text(entry.label, `Chunk ${index + 1}`, LIMITS.shortText),
      kind: text(entry.kind, "segment", 60),
      content,
      startLine: typeof entry.startLine === "number" ? asNumber(entry.startLine, 1, 1, 10_000_000) : undefined,
      endLine: typeof entry.endLine === "number" ? asNumber(entry.endLine, 1, 1, 10_000_000) : undefined,
    });
  }

  const stats: Record<string, number | string> = {};
  if (isRecord(raw.stats)) {
    for (const [key, value] of Object.entries(raw.stats).slice(0, 12)) {
      if (typeof value === "number" && Number.isFinite(value)) stats[text(key, "metric", 40)] = value;
      else if (typeof value === "string") stats[text(key, "metric", 40)] = text(value, "", 80);
    }
  }

  if (summary.length === 0 && chunks.length === 0) return null;
  return { summary, chunks, stats };
}

export function normalizeCritique(raw: unknown): CritiqueResult | null {
  if (!isRecord(raw)) return null;
  if (!Array.isArray(raw.findings)) return null;

  const findings: Finding[] = [];
  for (const [index, entry] of asArray(raw.findings, LIMITS.findings).entries()) {
    if (!isRecord(entry)) continue;
    const title = text(entry.title, "", LIMITS.shortText);
    const evidence = text(entry.evidence, "", LIMITS.evidence);
    if (title.length === 0 && evidence.length === 0) continue;

    const score = asNumber(entry.score, 50, 0, 100);
    findings.push(
      normalizeFinding({
        id: slugId(entry.id, "F", index),
        title: title || "Unlabelled risk",
        severity: scoreToSeverity(score),
        score,
        category: text(entry.category, "general", 60),
        location: text(entry.location, "unspecified", 120),
        evidence,
        explanation: text(entry.explanation, "", LIMITS.mediumText),
        recommendation: text(entry.recommendation, "", LIMITS.mediumText),
      }),
    );
  }

  return {
    verdict: text(raw.verdict, "", LIMITS.mediumText),
    findings,
    criticScore: asNumber(raw.riskScore ?? raw.score, findings[0]?.score ?? 0, 0, 100),
    exposure: normalizeExposure(raw.exposure),
  };
}

function normalizeExposure(raw: unknown): MoneyExposure | undefined {
  if (!isRecord(raw)) return undefined;
  const low = asNumber(raw.low, 0, 0, 1e12);
  const high = asNumber(raw.high, 0, 0, 1e12);
  if (low === 0 && high === 0) return undefined;
  const currency = text(raw.currency, "USD", 3).toUpperCase().replace(/[^A-Z]/g, "") || "USD";
  return {
    low: Math.min(low, high),
    high: Math.max(low, high),
    currency,
    basis: text(raw.basis, "Estimated from quantified clauses.", LIMITS.shortText),
  };
}

export function normalizeHeal(raw: unknown): HealResult | null {
  if (!isRecord(raw)) return null;
  const document = text(raw.repairedDocument, "", LIMITS.document);
  if (document.length === 0) return null;

  const patches: Patch[] = [];
  for (const [index, entry] of asArray(raw.patches, LIMITS.patches).entries()) {
    if (!isRecord(entry)) continue;
    const replacement = text(entry.replacement, "", 12_000);
    if (replacement.length === 0) continue;
    patches.push({
      id: slugId(entry.id, "P", index),
      findingId: text(entry.findingId, "", 40),
      title: text(entry.title, `Patch ${index + 1}`, LIMITS.shortText),
      rationale: text(entry.rationale, "", LIMITS.mediumText),
      original: text(entry.original, "", 12_000),
      replacement,
    });
  }

  return { strategy: text(raw.strategy, "", LIMITS.mediumText), patches, repairedDocument: document };
}

/** Verifier prose is optional: a live model may return notes only. */
export function normalizeVerifyNotes(raw: unknown): string[] {
  if (!isRecord(raw)) return [];
  return asArray(raw.notes, 8)
    .map((note) => text(note, "", 300))
    .filter((note) => note.length > 0);
}
