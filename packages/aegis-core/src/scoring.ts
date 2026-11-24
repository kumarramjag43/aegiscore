import type { CritiqueResult, Finding, RiskBand, RiskSummary, Severity } from "./types";

const SEVERITY_ORDER: Severity[] = ["info", "low", "medium", "high", "critical"];

/**
 * Additional findings compound risk, but the single worst finding dominates.
 * This keeps a 20-finding style-issue file from outranking one critical RCE.
 */
const COMPOUND_FACTOR = 0.25;

export function scoreToSeverity(score: number): Severity {
  if (score >= 85) return "critical";
  if (score >= 65) return "high";
  if (score >= 40) return "medium";
  if (score >= 15) return "low";
  return "info";
}

export function scoreToBand(score: number): RiskBand {
  if (score >= 85) return "critical";
  if (score >= 65) return "severe";
  if (score >= 40) return "elevated";
  if (score >= 15) return "guarded";
  return "minimal";
}

export function severityRank(severity: Severity): number {
  return SEVERITY_ORDER.indexOf(severity);
}

/** Normalise a single finding coming from an untrusted source. */
export function normalizeFinding(finding: Finding): Finding {
  const score = Math.min(100, Math.max(0, Math.round(finding.score)));
  return { ...finding, score, severity: scoreToSeverity(score) };
}

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) => b.score - a.score || a.location.localeCompare(b.location),
  );
}

/** Authoritative risk score. The critic's own number is advisory only. */
export function aggregateRisk(critique: CritiqueResult): RiskSummary {
  const findings = critique.findings;
  const criticScore = Math.min(100, Math.max(0, Math.round(critique.criticScore ?? findings[0]?.score ?? 0)));

  if (findings.length === 0) {
    return {
      score: 0,
      band: "minimal",
      severity: "info",
      verdict: critique.verdict || "No material risk identified.",
      criticScore,
      exposure: critique.exposure,
    };
  }

  const scores = findings.map((finding) => finding.score).sort((a, b) => b - a);
  const top = scores[0] ?? 0;
  const rest = scores.slice(1).reduce((sum, value) => sum + value, 0);
  const score = Math.min(100, Math.round(top + rest * COMPOUND_FACTOR));

  return {
    score,
    band: scoreToBand(score),
    severity: scoreToSeverity(score),
    verdict: critique.verdict || "Risk identified — review the findings below.",
    criticScore,
    exposure: critique.exposure,
  };
}

export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  return counts;
}
