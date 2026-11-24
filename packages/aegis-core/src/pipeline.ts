import { diffDocuments, unifiedDiff } from "./diff";
import { extractJsonObject } from "./json";
import {
  normalizeCritique,
  normalizeHeal,
  normalizeScan,
  normalizeVerifyNotes,
} from "./normalize";
import { resolveLlmClient } from "./providers";
import { buildMarkdown } from "./report";
import { aggregateRisk, sortFindings } from "./scoring";
import { clampInput, errorMessage } from "./security";
import { createSseStream } from "./sse";
import type {
  AgentEvent,
  AgentStage,
  AuditReport,
  DomainPack,
  Env,
  LlmClient,
  PipelineContext,
} from "./types";
import { buildVerification, coreChecks } from "./verify";

const DEFAULT_MAX_INPUT = 200_000;

export interface Pace {
  /** Delay between stages, milliseconds. */
  stage: number;
  /** Delay between log lines, milliseconds. */
  log: number;
}

export interface RunAuditOptions {
  pack: DomainPack;
  input: string;
  title?: string;
  env?: Env;
  /** Injected client (tests, custom routing). Overrides `env` resolution. */
  llm?: LlmClient;
  maxInputChars?: number;
  pace?: Pace;
  signal?: AbortSignal;
}

const now = () => Date.now();

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Run cancelled."));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function requireShape<T>(value: T | null): T {
  if (value === null) throw new Error("Model output did not match the required shape.");
  return value;
}

function newRunId(): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `run_${now().toString(36)}_${random}`;
}

type LogLevel = "info" | "warn" | "success";

interface StageOutcome<T> {
  value: T;
  fallbackUsed: boolean;
}

interface StageSpec<T> {
  stage: AgentStage;
  before: (ctx: PipelineContext) => string[];
  parse: (raw: unknown) => T | null;
  fallback: () => T;
  apply: (value: T) => void;
  after: (value: T) => { level: LogLevel; message: string }[];
  summary: (value: T) => string;
}

async function* executeStage<T>(
  spec: StageSpec<T>,
  ctx: PipelineContext,
  client: LlmClient,
  pack: DomainPack,
  pace: Pace,
  signal: AbortSignal | undefined,
  timings: { stage: AgentStage; ms: number }[],
): AsyncGenerator<AgentEvent, StageOutcome<T>, void> {
  const startedAt = now();
  yield { type: "stage.started", stage: spec.stage, at: startedAt };
  await sleep(pace.stage, signal);

  for (const message of spec.before(ctx)) {
    yield { type: "stage.log", stage: spec.stage, level: "info", message, at: now() };
    await sleep(pace.log, signal);
  }

  const prompt = pack.prompts[spec.stage](ctx);
  let value: T;
  let fallbackUsed = false;

  try {
    const raw = await client.complete({
      stage: spec.stage,
      system: prompt.system,
      user: prompt.user,
      context: { ...ctx },
      signal,
    });
    value = requireShape(spec.parse(extractJsonObject(raw)));
  } catch (error) {
    if (client.mode === "sandbox") throw error;
    fallbackUsed = true;
    yield {
      type: "stage.log",
      stage: spec.stage,
      level: "warn",
      message: `Live provider unusable (${errorMessage(error)}). Deterministic analyzers are taking over.`,
      at: now(),
    };
    value = spec.fallback();
  }

  spec.apply(value);

  for (const line of spec.after(value)) {
    yield { type: "stage.log", stage: spec.stage, level: line.level, message: line.message, at: now() };
    await sleep(pace.log, signal);
  }

  const ms = now() - startedAt;
  timings.push({ stage: spec.stage, ms });
  yield { type: "stage.completed", stage: spec.stage, ms, summary: spec.summary(value), at: now() };

  return { value, fallbackUsed };
}

/**
 * The four-agent pipeline. Yields every thought, log line and stage boundary so
 * the UI can stream live execution, then finishes with `report.ready`.
 */
export async function* runAudit(
  options: RunAuditOptions,
): AsyncGenerator<AgentEvent, AuditReport | null, void> {
  const startedAt = now();
  const id = newRunId();
  const pack = options.pack;
  const maxChars = options.maxInputChars ?? DEFAULT_MAX_INPUT;

  const clamped = clampInput(options.input, maxChars);
  if (!clamped.ok) {
    yield { type: "run.failed", message: clamped.reason ?? "Invalid input.", at: now() };
    return null;
  }

  const input = clamped.value;
  const title = (options.title ?? "").trim().slice(0, 160) || `Untitled ${pack.documentNoun}`;
  const client = options.llm ?? resolveLlmClient(options.env ?? {}, pack);
  const pace = options.pace ?? (client.mode === "sandbox" ? { stage: 260, log: 90 } : { stage: 0, log: 0 });

  const ctx: PipelineContext = {
    input,
    title,
    scan: { summary: "", chunks: [], stats: {} },
    critique: { verdict: "", findings: [] },
    heal: { strategy: "", patches: [], repairedDocument: "" },
  };
  const timings: { stage: AgentStage; ms: number }[] = [];
  let fallbackUsed = false;

  yield {
    type: "run.started",
    runId: id,
    domain: pack.id,
    domainLabel: pack.label,
    provider: { id: client.id, label: client.label, mode: client.mode },
    agents: [pack.agents.scanner, pack.agents.critic, pack.agents.healer, pack.agents.verifier],
    at: startedAt,
  };

  try {
    const scan = yield* executeStage(
      {
        stage: "scanner",
        before: (current) => [
          `Ingesting ${current.input.length.toLocaleString()} characters of ${pack.documentNoun}.`,
          `Agent thought: ${pack.agents.scanner.role}`,
        ],
        parse: normalizeScan,
        fallback: () => pack.sandbox.scan(input),
        apply: (value) => {
          ctx.scan = value;
        },
        after: (value) => [
          {
            level: "info",
            message: `Structured ${value.chunks.length} chunk(s)${
              Object.keys(value.stats).length > 0
                ? ` · ${Object.entries(value.stats)
                    .slice(0, 4)
                    .map(([key, stat]) => `${key}=${stat}`)
                    .join(" ")}`
                : ""
            }`,
          },
        ],
        summary: (value) => value.summary || `${value.chunks.length} chunk(s) parsed.`,
      },
      ctx,
      client,
      pack,
      pace,
      options.signal,
      timings,
    );
    fallbackUsed = fallbackUsed || scan.fallbackUsed;

    const critic = yield* executeStage(
      {
        stage: "critic",
        before: () => [
          `Evaluating ${ctx.scan.chunks.length} chunk(s) against the ${pack.label} risk model.`,
          `Agent thought: ${pack.agents.critic.role}`,
        ],
        parse: normalizeCritique,
        fallback: () => pack.sandbox.critique(input, ctx.scan),
        apply: (value) => {
          ctx.critique = value;
        },
        after: (value) => [
          ...sortFindings(value.findings)
            .slice(0, 6)
            .map((finding) => ({
              level: (finding.score >= 75 ? "warn" : "info") as LogLevel,
              message: `${finding.severity.toUpperCase()} · ${finding.title} @ ${finding.location}`,
            })),
          {
            level: "success",
            message: `Aggregate ${aggregateRisk(value).score}/100 (${aggregateRisk(value).band}).`,
          },
        ],
        summary: (value) =>
          value.findings.length === 0
            ? "No material findings."
            : `${value.findings.length} finding(s); highest ${sortFindings(value.findings)[0]?.severity ?? "info"}.`,
      },
      ctx,
      client,
      pack,
      pace,
      options.signal,
      timings,
    );
    fallbackUsed = fallbackUsed || critic.fallbackUsed;

    const heal = yield* executeStage(
      {
        stage: "healer",
        before: () => [
          `Drafting remediation for ${ctx.critique.findings.length} finding(s).`,
          `Agent thought: ${pack.agents.healer.role}`,
        ],
        parse: normalizeHeal,
        fallback: () => pack.sandbox.heal(input, ctx.scan, ctx.critique, title),
        apply: (value) => {
          ctx.heal = value;
        },
        after: (value) => [
          ...value.patches.slice(0, 6).map((patch) => ({
            level: "info" as LogLevel,
            message: `Patch ${patch.id} → ${patch.title}`,
          })),
          {
            level: "success",
            message: `Repaired artefact ready (${value.repairedDocument.length.toLocaleString()} chars).`,
          },
        ],
        summary: (value) =>
          `${value.patches.length} patch(es) · ${value.strategy.slice(0, 90) || "strategy not stated"}`,
      },
      ctx,
      client,
      pack,
      pace,
      options.signal,
      timings,
    );
    fallbackUsed = fallbackUsed || heal.fallbackUsed;

    // Verifier: deterministic checks first, then optional model commentary.
    const verifyStartedAt = now();
    yield { type: "stage.started", stage: "verifier", at: verifyStartedAt };
    await sleep(pace.stage, options.signal);
    ctx.checks = [...coreChecks(ctx), ...pack.verify(ctx)];
    yield {
      type: "stage.log",
      stage: "verifier",
      level: "info",
      message: `Running ${ctx.checks.length} verification check(s).`,
      at: now(),
    };
    await sleep(pace.log, options.signal);

    let verifyNotes: string[] = [];
    try {
      const prompt = pack.prompts.verifier(ctx);
      const raw = await client.complete({
        stage: "verifier",
        system: prompt.system,
        user: prompt.user,
        context: { ...ctx },
        signal: options.signal,
      });
      verifyNotes = normalizeVerifyNotes(extractJsonObject(raw));
    } catch (error) {
      if (client.mode === "sandbox") throw error;
      yield {
        type: "stage.log",
        stage: "verifier",
        level: "warn",
        message: `Verifier commentary unavailable (${errorMessage(error)}); deterministic checks still apply.`,
        at: now(),
      };
    }

    for (const check of ctx.checks.filter((entry) => !entry.passed)) {
      yield {
        type: "stage.log",
        stage: "verifier",
        level: "warn",
        message: `FAILED ${check.label} — ${check.detail}`,
        at: now(),
      };
    }

    const verifierMs = now() - verifyStartedAt;
    timings.push({ stage: "verifier", ms: verifierMs });
    const verification = buildVerification(ctx, pack, {
      usedFallback: fallbackUsed,
      sandbox: client.mode === "sandbox",
    });
    for (const note of verifyNotes) verification.notes.push(note);

    yield {
      type: "stage.completed",
      stage: "verifier",
      ms: verifierMs,
      summary: verification.passed
        ? `All ${verification.checks.length} checks passed (${verification.confidence}% confidence).`
        : `${verification.checks.filter((check) => !check.passed).length} check(s) failed (${verification.confidence}% confidence).`,
      at: now(),
    };

    const risk = aggregateRisk(ctx.critique);
    const partial: Omit<AuditReport, "markdown"> = {
      id,
      domain: pack.id,
      domainLabel: pack.label,
      createdAt: new Date(startedAt).toISOString(),
      input: { title, characters: input.length, chunks: ctx.scan.chunks.length },
      risk,
      findings: sortFindings(ctx.critique.findings),
      patches: ctx.heal.patches,
      repairedDocument: ctx.heal.repairedDocument,
      verification,
      scanSummary: ctx.scan.summary,
      healStrategy: ctx.heal.strategy,
      provider: { id: client.id, label: client.label, mode: client.mode },
      timings,
      totalMs: now() - startedAt,
    };

    const diff = diffDocuments(input, ctx.heal.repairedDocument);
    const markdown = buildMarkdown({
      report: partial,
      pack,
      unified: unifiedDiff(input, ctx.heal.repairedDocument),
    });
    const report: AuditReport = { ...partial, markdown };

    if (diff.coarse) {
      yield {
        type: "stage.log",
        stage: "verifier",
        level: "info",
        message: "Document is large — the diff viewer uses an index-aligned comparison.",
        at: now(),
      };
    }

    yield { type: "report.ready", report, at: now() };
    yield { type: "run.completed", ms: report.totalMs, at: now() };
    return report;
  } catch (error) {
    yield { type: "run.failed", message: errorMessage(error), at: now() };
    return null;
  }
}

/** Non-streaming helper: run the pipeline and return the final report. */
export async function collectAudit(options: RunAuditOptions): Promise<AuditReport | null> {
  let report: AuditReport | null = null;
  for await (const event of runAudit(options)) {
    if (event.type === "report.ready") report = event.report;
    if (event.type === "run.failed") throw new Error(event.message);
  }
  return report;
}

/** SSE ReadableStream for a Next.js route handler. */
export function createAuditSseStream(options: RunAuditOptions): ReadableStream<Uint8Array> {
  return createSseStream(runAudit(options), { signal: options.signal });
}
