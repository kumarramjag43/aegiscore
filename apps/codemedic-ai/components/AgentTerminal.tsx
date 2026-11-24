"use client";

import { useEffect, useRef } from "react";
import { Check, Circle, Loader2 } from "lucide-react";
import { cn, formatTimestamp, type AgentDescriptor, type AgentStage } from "@aegiscore/core";

export type LogLevel = "info" | "warn" | "success" | "error";

export interface LogLine {
  id: number;
  stage: AgentStage | "system";
  level: LogLevel;
  message: string;
  at: number;
}

export type StageState = "pending" | "active" | "done" | "failed";

const LEVEL_STYLE: Record<LogLevel, string> = {
  info: "text-slate-300",
  warn: "text-amber-300",
  success: "text-emerald-300",
  error: "text-rose-300",
};

const LEVEL_PREFIX: Record<LogLevel, string> = {
  info: "›",
  warn: "!",
  success: "✓",
  error: "×",
};

export interface AgentTerminalProps {
  logs: LogLine[];
  stages: Record<AgentStage, StageState>;
  agents: AgentDescriptor[];
  running: boolean;
  className?: string;
}

export function AgentTerminal({ logs, stages, agents, running, className }: AgentTerminalProps) {
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [logs]);

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="grid grid-cols-2 gap-2 border-b border-white/10 p-3 sm:grid-cols-4">
        {agents.map((agent, index) => {
          const state = stages[agent.stage] ?? "pending";
          return (
            <div
              key={agent.stage}
              className={cn(
                "rounded-lg border px-2.5 py-2 transition-colors",
                state === "active" && "border-cyan-400/40 bg-cyan-400/5",
                state === "done" && "border-emerald-400/30 bg-emerald-400/5",
                state === "failed" && "border-rose-400/40 bg-rose-400/5",
                state === "pending" && "border-white/10 bg-white/[0.02]",
              )}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: agent.accent }}
                  aria-hidden
                />
                <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-slate-200">
                  {index + 1}. {agent.name}
                </span>
                <span className="ml-auto">
                  {state === "active" ? (
                    <Loader2 className="h-3 w-3 animate-spin text-cyan-300" />
                  ) : state === "done" ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <Circle className="h-2.5 w-2.5 text-slate-600" />
                  )}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-slate-500">{agent.role}</p>
            </div>
          );
        })}
      </div>

      <div
        ref={scroller}
        className="scroll-slim min-h-0 flex-1 overflow-y-auto bg-[#03050a] p-3 font-mono text-[11.5px] leading-relaxed"
        role="log"
        aria-live="polite"
      >
        {logs.length === 0 ? (
          <p className="text-slate-600">
            <span className="text-cyan-500">aegis@core</span>: awaiting run — pick a preset, then launch the
            pipeline.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {logs.map((line) => {
              const agent = agents.find((entry) => entry.stage === line.stage);
              return (
                <li key={line.id} className="flex gap-2 animate-slide-up">
                  <span className="shrink-0 text-slate-700">{formatTimestamp(line.at)}</span>
                  <span
                    className="w-[76px] shrink-0 truncate uppercase"
                    style={{ color: agent?.accent ?? "#64748b" }}
                  >
                    {line.stage === "system" ? "core" : line.stage}
                  </span>
                  <span className={LEVEL_STYLE[line.level]}>
                    <span className="mr-1 opacity-60">{LEVEL_PREFIX[line.level]}</span>
                    {line.message}
                  </span>
                </li>
              );
            })}
            {running && (
              <li className="flex items-center gap-2 pt-1 text-slate-500">
                <span className="w-[76px] shrink-0" />
                <span className="inline-flex h-3 w-1.5 animate-pulse-line bg-cyan-400" aria-hidden />
                <span>agents working…</span>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
