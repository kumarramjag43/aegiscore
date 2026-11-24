"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  FileSignature,
  FileText,
  Landmark,
  Loader2,
  Play,
  Receipt,
  Scale,
  Sparkles,
  X,
} from "lucide-react";
import {
  cn,
  consumeEventStream,
  type AgentDescriptor,
  type AgentEvent,
  type AgentStage,
  type AuditReport,
  type Preset,
  type ProviderInfo,
} from "@aegiscore/core";
import { AuditTimeline } from "./AuditTimeline";
import { CounterDraft } from "./CounterDraft";
import { ExposurePanel } from "./ExposurePanel";
import { ReportPanel } from "./ReportPanel";
import { RiskHeatmap } from "./RiskHeatmap";
import type { LogLine, StageState } from "./types";

type Tab = "audit" | "heatmap" | "draft" | "report";
type Status = "idle" | "running" | "done" | "error";

const EMPTY_STAGES: Record<AgentStage, StageState> = {
  scanner: "pending",
  critic: "pending",
  healer: "pending",
  verifier: "pending",
};

const CODEMEDIC_URL = process.env.NEXT_PUBLIC_CODEMEDIC_URL ?? "http://localhost:3001";

const TABS: { id: Tab; label: string; icon: typeof Scale }[] = [
  { id: "audit", label: "Live audit", icon: Landmark },
  { id: "heatmap", label: "Risk heatmap", icon: Receipt },
  { id: "draft", label: "Counter-draft", icon: FileSignature },
  { id: "report", label: "Report", icon: FileText },
];

export interface LexGuardWorkspaceProps {
  presets: Preset[];
  agents: AgentDescriptor[];
  actionLabel: string;
  documentNoun: string;
}

export function LexGuardWorkspace({ presets, agents, actionLabel, documentNoun }: LexGuardWorkspaceProps) {
  const first = presets[0];
  const [input, setInput] = useState(first?.content ?? "");
  const [title, setTitle] = useState(first?.label ?? "");
  const [status, setStatus] = useState<Status>("idle");
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [stages, setStages] = useState<Record<AgentStage, StageState>>(EMPTY_STAGES);
  const [durations, setDurations] = useState<Partial<Record<AgentStage, number>>>({});
  const [report, setReport] = useState<AuditReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<ProviderInfo | null>(null);
  const [tab, setTab] = useState<Tab>("audit");
  const [activePreset, setActivePreset] = useState<string | null>(first?.id ?? null);

  const logId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { active?: ProviderInfo } | null) => {
        if (!cancelled && data?.active) setProvider(data.active);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, []);

  const pushLog = (line: Omit<LogLine, "id">) => {
    const entry: LogLine = { ...line, id: (logId.current += 1) };
    setLogs((previous) => [...previous, entry]);
  };

  const applyEvent = (event: AgentEvent) => {
    switch (event.type) {
      case "run.started":
        setProvider(event.provider);
        pushLog({
          stage: "system",
          level: "info",
          message: `Matter opened · ${event.domainLabel} · ${event.provider.label}`,
          at: event.at,
        });
        break;
      case "stage.started":
        setStages((previous) => ({ ...previous, [event.stage]: "active" }));
        break;
      case "stage.log":
        pushLog({ stage: event.stage, level: event.level, message: event.message, at: event.at });
        break;
      case "stage.completed":
        setStages((previous) => ({ ...previous, [event.stage]: "done" }));
        setDurations((previous) => ({ ...previous, [event.stage]: event.ms }));
        pushLog({
          stage: event.stage,
          level: "success",
          message: `${event.summary} (${event.ms} ms)`,
          at: event.at,
        });
        break;
      case "report.ready":
        setReport(event.report);
        setTab("heatmap");
        pushLog({
          stage: "system",
          level: "success",
          message: `Opinion ready · risk ${event.report.risk.score}/100 · ${event.report.patches.length} redline(s)`,
          at: event.at,
        });
        break;
      case "run.failed":
        setError(event.message);
        setStages((previous) => {
          const next = { ...previous };
          for (const stage of Object.keys(next) as AgentStage[]) {
            if (next[stage] === "active") next[stage] = "failed";
          }
          return next;
        });
        pushLog({ stage: "system", level: "error", message: event.message, at: event.at });
        break;
      case "run.completed":
        pushLog({ stage: "system", level: "success", message: `Matter closed in ${event.ms} ms`, at: event.at });
        break;
    }
  };

  const run = async () => {
    if (status === "running") return;
    const payload = input.trim();
    if (payload.length === 0) {
      setError(`Paste a ${documentNoun} or load a preset first.`);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    logId.current = 0;
    setLogs([]);
    setStages(EMPTY_STAGES);
    setDurations({});
    setReport(null);
    setError(null);
    setStatus("running");
    setTab("audit");

    let received = false;
    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: payload, title }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(detail?.error ?? `The audit endpoint returned ${response.status}.`);
      }

      await consumeEventStream(
        response,
        (event) => {
          if (event.type === "report.ready") received = true;
          applyEvent(event);
        },
        controller.signal,
      );

      setStatus(received ? "done" : "error");
      if (!received) setError("The stream closed before an opinion was produced.");
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") {
        pushLog({ stage: "system", level: "warn", message: "Matter cancelled.", at: Date.now() });
        setStatus("idle");
        return;
      }
      const message = cause instanceof Error ? cause.message : "Unexpected failure.";
      setError(message);
      setStatus("error");
      pushLog({ stage: "system", level: "error", message, at: Date.now() });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const loadPreset = (preset: Preset) => {
    abortRef.current?.abort();
    setInput(preset.content);
    setTitle(preset.label);
    setActivePreset(preset.id);
    setReport(null);
    setError(null);
    setLogs([]);
    setStages(EMPTY_STAGES);
    setDurations({});
    setStatus("idle");
    setTab("audit");
  };

  return (
    <div className="relative min-h-screen">
      <div className="ledger-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[380px] bg-[radial-gradient(55%_100%_at_50%_0%,rgba(251,191,36,0.10),transparent_70%)]"
        aria-hidden
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1500px] flex-col px-4 pb-8 pt-5 sm:px-6">
        <header className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-amber-300/25 to-indigo-400/10 ring-1 ring-amber-300/40">
              <Scale className="h-5 w-5 text-amber-200" />
            </span>
            <div>
              <h1 className="font-serif text-[16px] font-semibold tracking-tight text-white">
                LexGuard <span className="text-amber-300">AI</span>
              </h1>
              <p className="text-[11px] text-slate-500">Contract, invoice &amp; financial fraud intelligence</p>
            </div>
          </div>

          <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-wider text-slate-400 sm:inline-flex">
            <Sparkles className="h-3 w-3 text-amber-300" />
            Kiroween · Skeleton Crew
          </span>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-medium",
                provider?.mode === "live"
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                  : "border-slate-500/30 bg-slate-500/10 text-slate-300",
              )}
              title="Active model provider for this app"
            >
              <span
                className={cn("h-1.5 w-1.5 rounded-full", provider?.mode === "live" ? "bg-emerald-400" : "bg-slate-400")}
              />
              {provider ? provider.label : "detecting provider…"}
            </span>
            <a
              href={CODEMEDIC_URL}
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10.5px] text-slate-300 transition-colors hover:border-cyan-400/40 hover:text-cyan-200"
            >
              Same core → CodeMedic AI
              <ArrowUpRight className="h-3 w-3" />
            </a>
          </div>
        </header>

        <main className="mt-5 grid flex-1 gap-4 lg:grid-cols-[minmax(0,430px)_minmax(0,1fr)]">
          <section className="flex min-h-0 flex-col gap-4">
            <div className="panel-ink p-4">
              <div className="flex items-center gap-2">
                <FileSignature className="h-4 w-4 text-amber-300" />
                <h2 className="font-serif text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
                  Instrument
                </h2>
                <span className="ml-auto font-mono text-[10px] text-slate-600">{input.length.toLocaleString()} chars</span>
              </div>

              <label htmlFor="matter" className="mt-3 block text-[10px] uppercase tracking-wider text-slate-500">
                Matter / document label
              </label>
              <input
                id="matter"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Northwind MSA 2026"
                maxLength={160}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-amber-300/50"
              />

              <label htmlFor="document" className="mt-3 block text-[10px] uppercase tracking-wider text-slate-500">
                Contract, invoice or agreement text
              </label>
              <textarea
                id="document"
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  setActivePreset(null);
                }}
                spellCheck={false}
                placeholder="Paste the clauses, invoice or agreement you want reviewed…"
                className="scroll-slim mt-1 h-[230px] w-full resize-none rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-amber-300/50"
              />

              <div className="mt-3 flex flex-wrap gap-1.5">
                {presets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => loadPreset(preset)}
                    title={preset.description}
                    className={cn(
                      "rounded-lg border px-2.5 py-1.5 text-left text-[10.5px] font-medium transition-colors",
                      activePreset === preset.id
                        ? "border-amber-300/50 bg-amber-300/10 text-amber-100"
                        : "border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/25 hover:text-slate-200",
                    )}
                  >
                    {preset.label}
                    <span className="ml-1.5 font-normal text-slate-600">{preset.meta}</span>
                  </button>
                ))}
              </div>

              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={run}
                  disabled={status === "running"}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-amber-300 px-3 py-2.5 text-xs font-semibold text-[#231a04] shadow-[0_10px_30px_-12px_rgba(251,191,36,0.85)] transition-colors hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {status === "running" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  {status === "running" ? "Agents in session…" : actionLabel}
                </button>
                {status === "running" && (
                  <button
                    type="button"
                    onClick={() => abortRef.current?.abort()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2.5 text-xs font-medium text-slate-300 transition-colors hover:border-rose-400/40 hover:text-rose-200"
                  >
                    <X className="h-3.5 w-3.5" />
                    Stop
                  </button>
                )}
              </div>

              {error && (
                <p className="mt-3 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[11px] leading-relaxed text-rose-200">
                  {error}
                </p>
              )}
            </div>

            {report ? (
              <ExposurePanel report={report} />
            ) : (
              <div className="panel-ink p-4">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-amber-300" />
                  <h2 className="font-serif text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
                    Financial exposure
                  </h2>
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                  No matter opened yet. Run the audit to quantify exposure, score every clause and draft the
                  counter-proposal.
                </p>
              </div>
            )}
          </section>

          <section className="panel-ink flex min-h-[560px] min-w-0 flex-col overflow-hidden">
            <div className="flex flex-wrap items-center gap-1 border-b border-white/[0.08] px-2 py-2">
              {TABS.map((entry) => {
                const Icon = entry.icon;
                const badge = entry.id === "heatmap" ? (report?.findings.length ?? 0) : entry.id === "draft" ? (report?.patches.length ?? 0) : 0;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setTab(entry.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
                      tab === entry.id
                        ? "bg-white/[0.07] text-white"
                        : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {entry.label}
                    {badge > 0 && (
                      <span className="rounded bg-amber-300/15 px-1 font-mono text-[10px] text-amber-200">{badge}</span>
                    )}
                  </button>
                );
              })}
              <span className="ml-auto pr-1 text-[10px] uppercase tracking-wider text-slate-600">
                aegis-core · 4 agents
              </span>
            </div>

            <div className="min-h-0 flex-1">
              {tab === "audit" && (
                <AuditTimeline
                  logs={logs}
                  stages={stages}
                  durations={durations}
                  agents={agents}
                  running={status === "running"}
                />
              )}
              {tab === "heatmap" &&
                (report ? <RiskHeatmap report={report} /> : <EmptyState label="The Fraud Critic populates the heatmap once the matter is opened." />)}
              {tab === "draft" &&
                (report ? <CounterDraft report={report} /> : <EmptyState label="The Redline Drafter assembles the counter-proposal here." />)}
              {tab === "report" &&
                (report ? <ReportPanel report={report} /> : <EmptyState label="The Counsel Verifier signs the final JSON + Markdown opinion." />)}
            </div>
          </section>
        </main>

        <footer className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] text-slate-600">
          <span>
            <span className="text-slate-400">packages/aegis-core</span> · scanner → critic → healer → verifier
          </span>
          <span className="hidden sm:inline">·</span>
          <span>Same skeleton also powers CodeMedic AI</span>
          <span className="ml-auto">
            {provider?.mode === "live"
              ? "Live model calls enabled"
              : "Sandbox mode — no API key required, deterministic results"}
          </span>
        </footer>
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center p-10 text-center">
      <p className="max-w-xs text-xs leading-relaxed text-slate-500">{label}</p>
    </div>
  );
}
