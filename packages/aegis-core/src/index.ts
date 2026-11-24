/**
 * @aegiscore/core — the single Skeleton powering CodeMedic AI and LexGuard AI.
 *
 * Layers:
 *   types      the public contract (events, report, DomainPack)
 *   pipeline   the 4-agent orchestration + streaming
 *   providers  pluggable LLM clients (openai / groq / gemini / anthropic / sandbox)
 *   packs      domain knowledge (code-security, contract-fraud)
 *   diff       side-by-side and unified diffing
 *   verify     deterministic verification of every remediation
 *   report     exportable markdown artefact
 */

export * from "./types";
export {
  runAudit,
  collectAudit,
  createAuditSseStream,
  type Pace,
  type RunAuditOptions,
} from "./pipeline";
export { createSseStream, STAGE_ORDER, type SseStreamOptions } from "./sse";
export { diffDocuments, unifiedDiff, type DiffKind, type DiffResult, type DiffRow } from "./diff";
export {
  aggregateRisk,
  countBySeverity,
  normalizeFinding,
  scoreToBand,
  scoreToSeverity,
  severityRank,
  sortFindings,
} from "./scoring";
export { buildVerification, coreChecks, type VerifyMeta } from "./verify";
export { buildMarkdown, formatMoney } from "./report";
export { clampInput, errorMessage, redactSecrets } from "./security";
export { extractJsonObject } from "./json";
export { normalizeCritique, normalizeHeal, normalizeScan, normalizeVerifyNotes } from "./normalize";
export {
  DEFAULT_UPLOAD_LIMIT,
  consumeEventStream,
  copyText,
  downloadTextFile,
  formatBytes,
  guessFileName,
  readUploadedText,
  type UploadRule,
  type UploadedText,
} from "./client";
export {
  describeProviders,
  isDemoMode,
  resolveLlmClient,
  createSandboxClient,
  ProviderError,
  type ProviderCandidate,
} from "./providers";
export { codeSecurityPack } from "./packs/code-security";
export { contractFraudPack } from "./packs/contract-fraud";
export {
  DETECTORS,
  detectHits,
  hitsToFindings,
  type Detector,
  type Hit,
} from "./packs/code-security/detectors";
export {
  LEGAL_SIGNALS,
  analyzeLegal,
  parseClauses,
  type Clause,
  type LegalAnalysis,
  type LegalSignal,
} from "./packs/contract-fraud/detectors";
export {
  BAND_COLOR,
  BAND_LABEL,
  SEVERITY_STYLE,
  cn,
  formatDuration,
  formatTimestamp,
  type SeverityStyle,
} from "./ui";

/** The registry the two apps read from — one core, two products. */
import { codeSecurityPack } from "./packs/code-security";
import { contractFraudPack } from "./packs/contract-fraud";
import type { DomainPack } from "./types";

export const PACKS: Record<string, DomainPack> = {
  "code-security": codeSecurityPack,
  "contract-fraud": contractFraudPack,
};

export function getPack(id: string): DomainPack {
  const pack = PACKS[id];
  if (!pack) throw new Error(`Unknown AegisCore domain pack: ${id}`);
  return pack;
}
