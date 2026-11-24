"use client";

import { Check, Loader2 } from "lucide-react";
import { cn, formatDuration, type AgentDescriptor, type AgentStage } from "@aegiscore/core";
import type { LogLine, StageState } from "./types";

const LEVEL_DOT: Record<LogLine["level"], string> = {
  info: "bg-slate-500",
  warn: "bg-amber-400",
  success: "bg-emerald-400",
  error: "bg-rose-400",
};

const LEVEL_TEXT: Record<LogLine["level"], string> = {
  info: "text-slate-400",
  warn: "text-amber-200",
  success: "text-emerald-200",
  error: "text-rose-200",
};

export interface AuditTimelineProps {
  logs: LogLine[];
  stages: Record<AgentStage, StageState>;
  durations: Partial<Record<AgentStage, number>>;
  agents: AgentDescriptor[];
  running: boolean;
}

export function AuditTimeline({ logs, stages, durations, agents, running }: AuditTimelineProps) {
  const system = logs.filter((line) => line.stage === "system");

  return (
    <div className="scroll-slim h-full overflow-y-auto p-4">
      {system.length > 0 && (
        <ul className="mb-4 space-y-1 border-b border-white/[0.06] pb-3">
          {system.map((line) => (
            <li key={line.id} className={cn("flex items-start gap-2 text-[11px]", LEVEL_TEXT[line.level])}>
              <span className={cn("mt-1.5 h-1 w-1 shrink-0 rounded-full", LEVEL_DOT[line.level])} />
              <span className="font-mono">{line.message}</span>
            </li>
          ))}
        </ul>
      )}

      <ol className="relative space-y-5">
        <span className="absolute left-[7px] top-2 h-[calc(100%-16px)] w-px bg-gradient-to-b from-white/15 via-white/10 to-transparent" aria-hidden />

        {agents.map((agent, index) => {
          const state = stages[agent.stage] ?? "pending";
          const stageLogs = logs.filter((line) => line.stage === agent.stage);
          const duration = durations[agent.stage];

          return (
            <li key={agent.stage} className="relative pl-7">
              <span
                className={cn(
                  "absolute left-0 top-1 grid h-3.5 w-3.5 place-items-center rounded-full ring-2 ring-[#070c16]",
                  state === "done" && "bg-emerald-400",
                  state === "active" && "bg-amber-300",
                  state === "failed" && "bg-rose-400",
                  state === "pending" && "bg-slate-600",
                )}
                aria-hidden
              />
              <header className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-mono text-[10px] text-slate-600">{String(index + 1).padStart(2, "0")}</span>
                <h3 className="font-serif text-sm font-semibold tracking-tight text-slate-100">{agent.name}</h3>
                {state === "active" && <Loader2 className="h-3 w-3 animate-spin text-amber-300" />}
                {state === "done" && <Check className="h-3 w-3 text-emerald-400" />}
                {duration !== undefined && (
                  <span className="ml-auto font-mono text-[10px] text-slate-600">{formatDuration(duration)}</span>
                )}
              </header>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{agent.role}</p>

              {stageLogs.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {stageLogs.map((line) => (
                    <li
                      key={line.id}
                      className={cn(
                        "flex items-start gap-2 rounded-md border border-white/[0.05] bg-white/[0.015] px-2 py-1 text-[11px] leading-snug animate-slide-up",
                        LEVEL_TEXT[line.level],
                      )}
                    >
                      <span className={cn("mt-1.5 h-1 w-1 shrink-0 rounded-full", LEVEL_DOT[line.level])} />
                      <span className="font-mono">{line.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>

      {logs.length === 0 && (
        <p className="mt-2 font-mono text-[11px] text-slate-600">
          awaiting instrument — load a preset, then run the audit.
        </p>
      )}

      {running && (
        <p className="mt-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-amber-300/80">
          <span className="h-2 w-1 animate-pulse-line bg-amber-300" aria-hidden />
          agents in session
        </p>
      )}
    </div>
  );
}
