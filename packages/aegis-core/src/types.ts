/**
 * AegisCore public contract.
 *
 * Everything in this file is domain-agnostic. A `DomainPack` supplies the
 * vocabulary, prompts, deterministic analyzers and verifier rules; the core
 * owns orchestration, normalisation, scoring, streaming and reporting.
 */

export type AgentStage = "scanner" | "critic" | "healer" | "verifier";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type RiskBand = "minimal" | "guarded" | "elevated" | "severe" | "critical";

export interface AgentDescriptor {
  stage: AgentStage;
  /** Human name shown in the execution terminal, e.g. "Scanner". */
  name: string;
  /** One-line responsibility. */
  role: string;
  /** Hex accent used by both apps' design systems. */
  accent: string;
}

/** A structured slice of the raw input produced by the Scanner agent. */
export interface SourceChunk {
  id: string;
  label: string;
  kind: string;
  startLine?: number;
  endLine?: number;
  content: string;
}

export interface ScanResult {
  summary: string;
  chunks: SourceChunk[];
  stats: Record<string, number | string>;
}

export interface Finding {
  id: string;
  title: string;
  severity: Severity;
  /** Intrinsic 0-100 severity of this finding alone. */
  score: number;
  category: string;
  /** "Line 42" / "Clause 4.2" — always anchored to the source. */
  location: string;
  /** Verbatim excerpt from the input that justifies the finding. */
  evidence: string;
  explanation: string;
  recommendation: string;
}

export interface MoneyExposure {
  low: number;
  high: number;
  currency: string;
  basis: string;
}

export interface CritiqueResult {
  verdict: string;
  findings: Finding[];
  exposure?: MoneyExposure;
  /** Critic-reported 0-100 score; advisory, the core recomputes the final one. */
  criticScore?: number;
}

export interface Patch {
  id: string;
  findingId: string;
  title: string;
  rationale: string;
  original: string;
  replacement: string;
}

export interface HealResult {
  strategy: string;
  patches: Patch[];
  /** The full corrected artefact (secure source file / counter-contract). */
  repairedDocument: string;
}

export interface VerificationCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface VerifyResult {
  passed: boolean;
  /** 0-100 confidence that the remediation actually holds. */
  confidence: number;
  checks: VerificationCheck[];
  notes: string[];
}

export interface RiskSummary {
  /** Authoritative 0-100 score recomputed by the core, never trusted blindly. */
  score: number;
  band: RiskBand;
  severity: Severity;
  verdict: string;
  /** Critic-reported score, kept for transparency. */
  criticScore: number;
  exposure?: MoneyExposure;
}

export interface AuditReport {
  id: string;
  domain: string;
  domainLabel: string;
  createdAt: string;
  input: { title: string; characters: number; chunks: number };
  risk: RiskSummary;
  findings: Finding[];
  patches: Patch[];
  repairedDocument: string;
  verification: VerifyResult;
  scanSummary: string;
  healStrategy: string;
  markdown: string;
  provider: { id: string; label: string; mode: "live" | "sandbox" };
  timings: { stage: AgentStage; ms: number }[];
  totalMs: number;
}

/* ------------------------------------------------------------------ events */

export type EventLevel = "info" | "warn" | "success" | "error";

export type AgentEvent =
  | {
      type: "run.started";
      runId: string;
      domain: string;
      domainLabel: string;
      provider: { id: string; label: string; mode: "live" | "sandbox" };
      agents: AgentDescriptor[];
      at: number;
    }
  | { type: "stage.started"; stage: AgentStage; at: number }
  | { type: "stage.log"; stage: AgentStage; level: EventLevel; message: string; at: number }
  | { type: "stage.completed"; stage: AgentStage; ms: number; summary: string; at: number }
  | { type: "report.ready"; report: AuditReport; at: number }
  | { type: "run.failed"; message: string; at: number }
  | { type: "run.completed"; ms: number; at: number };

/* ------------------------------------------------------------------- packs */

export interface PipelineContext {
  input: string;
  title: string;
  scan: ScanResult;
  critique: CritiqueResult;
  heal: HealResult;
  /** Populated before the Verifier stage so packs and clients can cite results. */
  checks?: VerificationCheck[];
}

export interface Preset {
  id: string;
  label: string;
  description: string;
  /** Short badge, e.g. "Node · Express" or "Vendor MSA". */
  meta: string;
  content: string;
}

export interface PromptPair {
  system: string;
  user: string;
}

/**
 * A domain pack is the *only* place domain knowledge lives. Adding a third
 * product means adding a pack — never touching the core.
 */
export interface DomainPack {
  id: string;
  label: string;
  /** Noun for the analysed artefact: "source file", "agreement". */
  documentNoun: string;
  /** Human label for the primary action, e.g. "Run security audit". */
  actionLabel: string;
  agents: Record<AgentStage, AgentDescriptor>;
  /** One-click realistic samples shipped to both UIs. */
  presets: Preset[];
  /** JSON schema-ish description handed to the LLM per stage. */
  prompts: Record<AgentStage, (ctx: Partial<PipelineContext>) => PromptPair>;
  /**
   * Deterministic analyzers used by the sandbox provider (and as a fallback
   * when a live provider returns unusable output). They must produce the same
   * shapes as the LLM contract.
   */
  sandbox: {
    scan: (input: string) => ScanResult;
    critique: (input: string, scan: ScanResult) => CritiqueResult;
    heal: (input: string, scan: ScanResult, critique: CritiqueResult, title?: string) => HealResult;
  };
  /** Domain-specific verifier rules, combined with core invariants. */
  verify: (ctx: PipelineContext) => VerificationCheck[];
  /** Optional extra log lines emitted by the Critic stage. */
  describeFinding?: (finding: Finding) => string;
}

/* ---------------------------------------------------------------- provider */

export interface LlmRequest {
  stage: AgentStage;
  system: string;
  user: string;
  /** Structured state accumulated by the pipeline so far. */
  context: Partial<PipelineContext>;
  signal?: AbortSignal;
}

export interface LlmClient {
  id: string;
  label: string;
  mode: "live" | "sandbox";
  /** Returns raw model text (expected to contain a JSON object). */
  complete(request: LlmRequest): Promise<string>;
}

export interface ProviderInfo {
  id: string;
  label: string;
  mode: "live" | "sandbox";
}

export type Env = Record<string, string | undefined>;
