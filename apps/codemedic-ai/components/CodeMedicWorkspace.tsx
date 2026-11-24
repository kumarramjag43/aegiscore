"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bug,
  FileCode2,
  GitCompare,
  Loader2,
  Play,
  ScanLine,
  Shield,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
  X,
} from "lucide-react";
import {
  cn,
  consumeEventStream,
  guessFileName,
  type AgentDescriptor,
  type AgentEvent,
  type AgentStage,
  type AuditReport,
  type Preset,
  type ProviderInfo,
} from "@aegiscore/core";
import { AgentTerminal, type LogLine, type StageState } from "./AgentTerminal";
import { RiskGauge } from "./RiskGauge";
import { FindingsPanel } from "./FindingsPanel";
import { DiffPanel } from "./DiffPanel";
import { ReportPanel } from "./ReportPanel";
import { FileDrop } from "./FileDrop";

type Tab = "agents" | "findings" | "diff" | "report";
type Status = "idle" | "running" | "done" | "error";

const EMPTY_STAGES: Record<AgentStage, StageState> = {
  scanner: "pending",
  critic: "pending",
  healer: "pending",
  verifier: "pending",
};

const LEXGUARD_URL = process.env.NEXT_PUBLIC_LEXGUARD_URL ?? "http://localhost:3002";

const SOURCE_EXTENSIONS = [".js", ".ts", ".tsx", ".mjs", ".cjs", ".py", ".go", ".java", ".json"];

const TABS: { id: Tab; label: string; icon: typeof Bug }[] = [
  { id: "agents", label: "Live agents", icon: SquareTerminal },
  { id: "findings", label: "Findings", icon: Bug },
  { id: "diff", label: "Diff", icon: GitCompare },
  { id: "report", label: "Report", icon: FileCode2 },
];

export interface CodeMedicWorkspaceProps {
  presets: Preset[];
  agents: AgentDescriptor[];
  actionLabel: string;
  documentNoun: string;
}

export function CodeMedicWorkspace({ presets, agents, actionLabel, documentNoun }: CodeMedicWorkspaceProps) {
  const first = presets[0];
  const [input, setInput] = useState(first?.content ?? "");
  const [title, setTitle] = useState(first?.label ?? "");
  const [status, setStatus] = useState<Status>("idle");
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [stages, setStages] = useState<Record<AgentStage, StageState>>(EMPTY_STAGES);
  const [report, setReport] = useState<AuditReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<ProviderInfo | null>(null);
  const [tab, setTab] = useState<Tab>("agents");
  const [activePreset, setActivePreset] = useState<string | null>(first?.id ?? null);
  const [file, setFile] = useState<{ name: string; bytes: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

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
          message: `Pipeline armed · ${event.domainLabel} · ${event.provider.label}`,
          at: event.at,
        });
        break;
      case "stage.started":
        setStages((previous) => ({ ...previous, [event.stage]: "active" }));
        pushLog({
          stage: event.stage,
          level: "info",
          message: `${agents.find((agent) => agent.stage === event.stage)?.name ?? event.stage} engaged`,
          at: event.at,
        });
        break;
      case "stage.log":
        pushLog({ stage: event.stage, level: event.level, message: event.message, at: event.at });
        break;
      case "stage.completed":
        setStages((previous) => ({ ...previous, [event.stage]: "done" }));
        pushLog({
          stage: event.stage,
          level: "success",
          message: `${event.summary} (${event.ms} ms)`,
          at: event.at,
        });
        break;
      case "report.ready":
        setReport(event.report);
        setTab("findings");
        pushLog({
          stage: "system",
          level: "success",
          message: `Report ${event.report.id} ready · risk ${event.report.risk.score}/100 · ${event.report.patches.length} patch(es)`,
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
        pushLog({
          stage: "system",
          level: "success",
          message: `Run complete in ${event.ms} ms`,
          at: event.at,
        });
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
    setReport(null);
    setError(null);
    setStatus("running");
    setTab("agents");

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
      if (!received) setError("The stream closed before a report was produced.");
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") {
        pushLog({ stage: "system", level: "warn", message: "Run cancelled.", at: Date.now() });
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

  const stop = () => {
    abortRef.current?.abort();
  };

  const loadPreset = (preset: Preset) => {
    abortRef.current?.abort();
    setInput(preset.content);
    setTitle(preset.label);
    setActivePreset(preset.id);
    setFile(null);
    setUploadError(null);
    setReport(null);
    setError(null);
    setLogs([]);
    setStages(EMPTY_STAGES);
    setStatus("idle");
    setTab("agents");
  };

  const counts = report
    ? {
        findings: report.findings.length,
        diff: report.patches.length,
      }
    : { findings: 0, diff: 0 };

  return (
    <div className="relative min-h-screen">
      <div className="cyber-grid pointer-events-none absolute inset-0 opacity-70" aria-hidden />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_100%_at_50%_0%,rgba(34,211,238,0.14),transparent_70%)]"
        aria-hidden
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1500px] flex-col px-4 pb-8 pt-5 sm:px-6">
        <header className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-cyan-400/25 to-emerald-400/10 ring-1 ring-cyan-400/40">
              <Shield className="h-5 w-5 text-cyan-300" />
            </span>
            <div>
              <h1 className="text-[15px] font-semibold tracking-tight text-white">
                CodeMedic <span className="text-cyan-400">AI</span>
              </h1>
              <p className="text-[11px] text-slate-500">Autonomous code &amp; API security auditor</p>
            </div>
          </div>

          <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-wider text-slate-400 sm:inline-flex">
            <Sparkles className="h-3 w-3 text-cyan-400" />
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
              title={
                provider?.mode === "live"
                  ? "Live model calls are enabled for this app"
                  : "Deterministic Aegis sandbox — the full pipeline runs with no API key"
              }
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  provider?.mode === "live" ? "bg-emerald-400" : "bg-slate-400",
                )}
              />
              {provider
                ? provider.mode === "live"
                  ? `Live · ${provider.label}`
                  : "Live Sandbox Engine Active"
                : "detecting provider…"}
            </span>
            <a
              href={LEXGUARD_URL}
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10.5px] text-slate-300 transition-colors hover:border-indigo-400/40 hover:text-indigo-200"
            >
              Same core → LexGuard AI
              <ArrowUpRight className="h-3 w-3" />
            </a>
          </div>
        </header>

        <main className="mt-5 grid flex-1 gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <section className="flex min-h-0 flex-col gap-4">
            <div className="panel p-4">
              <div className="flex items-center gap-2">
                <ScanLine className="h-4 w-4 text-cyan-400" />
                <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">Target</h2>
                <span className="ml-auto font-mono text-[10px] text-slate-600">{input.length.toLocaleString()} chars</span>
              </div>

              <label htmlFor="title" className="mt-3 block text-[10px] uppercase tracking-wider text-slate-500">
                File or endpoint label
              </label>
              <input
                id="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="api/users.js"
                maxLength={160}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-400/50"
              />

              <label htmlFor="code" className="mt-3 block text-[10px] uppercase tracking-wider text-slate-500">
                Code / API snippet
              </label>
              <textarea
                id="code"
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  setActivePreset(null);
                }}
                spellCheck={false}
                placeholder="Paste the handler, route or module you want audited…"
                className="scroll-slim mt-1 h-[240px] w-full resize-none rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[11.5px] leading-relaxed text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-400/50"
              />

              <FileDrop
                rule={{ extensions: SOURCE_EXTENSIONS, maxBytes: 200_000 }}
                accept={SOURCE_EXTENSIONS.join(",")}
                hint=".js .ts .py .go .java .json · 200 KB"
                file={file}
                disabled={status === "running"}
                onClear={() => setFile(null)}
                onLoaded={(loaded) => {
                  setFile({ name: loaded.name, bytes: loaded.bytes });
                  setUploadError(null);
                  setInput(loaded.text);
                  setTitle(loaded.name);
                  setActivePreset(null);
                  setReport(null);
                  setError(null);
                  setStatus("idle");
                }}
                onError={setUploadError}
              />
              {uploadError && (
                <p className="mt-2 rounded-lg border border-rose-400/30 bg-rose-500/10 px-2.5 py-1.5 text-[10.5px] text-rose-200">
                  {uploadError}
                </p>
              )}

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
                        ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-200"
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
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-cyan-500 px-3 py-2.5 text-xs font-semibold text-[#031016] shadow-[0_10px_30px_-12px_rgba(34,211,238,0.9)] transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {status === "running" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  {status === "running" ? "Agents running…" : actionLabel}
                </button>
                {status === "running" && (
                  <button
                    type="button"
                    onClick={stop}
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

            <div className="panel p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">Risk posture</h2>
              </div>
              {report ? (
                <div className="mt-3">
                  <RiskGauge report={report} />
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[10.5px]">
                    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2">
                      <p className="text-slate-500">Patches applied</p>
                      <p className="text-sm font-semibold text-slate-100">{report.patches.length}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2">
                      <p className="text-slate-500">Runtime</p>
                      <p className="text-sm font-semibold text-slate-100">{(report.totalMs / 1000).toFixed(1)}s</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                  No run yet. Launch the pipeline to see the live risk score, findings and the verified patch.
                </p>
              )}
            </div>
          </section>

          <section className="panel flex min-h-[560px] min-w-0 flex-col overflow-hidden">
            <div className="flex flex-wrap items-center gap-1 border-b border-white/10 px-2 py-2">
              {TABS.map((entry) => {
                const Icon = entry.icon;
                const badge =
                  entry.id === "findings" ? counts.findings : entry.id === "diff" ? counts.diff : 0;
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
                      <span className="rounded bg-cyan-400/15 px-1 font-mono text-[10px] text-cyan-300">{badge}</span>
                    )}
                  </button>
                );
              })}
              <span className="ml-auto pr-1 text-[10px] uppercase tracking-wider text-slate-600">
                aegis-core · 4 agents
              </span>
            </div>

            <div className="min-h-0 flex-1">
              {tab === "agents" && (
                <AgentTerminal logs={logs} stages={stages} agents={agents} running={status === "running"} />
              )}

              {tab === "findings" &&
                (report ? (
                  <FindingsPanel report={report} />
                ) : (
                  <EmptyState label="Findings appear once the Critic has scored the target." />
                ))}

              {tab === "diff" &&
                (report ? (
                  <DiffPanel
                    original={input}
                    report={report}
                    fileName={guessFileName(file?.name ?? title, ".js")}
                  />
                ) : (
                  <EmptyState label="The side-by-side diff is generated by the Auto-Healer." />
                ))}

              {tab === "report" &&
                (report ? (
                  <ReportPanel report={report} />
                ) : (
                  <EmptyState label="The Verifier signs the final JSON + Markdown report." />
                ))}
            </div>
          </section>
        </main>

        <footer className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] text-slate-600">
          <span>
            <span className="text-slate-400">packages/aegis-core</span> · scanner → critic → healer → verifier
          </span>
          <span className="hidden sm:inline">·</span>
          <span>Same skeleton also powers LexGuard AI</span>
          <span className="ml-auto">
            {provider?.mode === "live"
              ? "Live model calls enabled"
              : "Live Sandbox Engine — deterministic pipeline, no API key required"}
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
