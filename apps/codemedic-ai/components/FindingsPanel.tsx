"use client";

import { MapPin } from "lucide-react";
import { cn, SEVERITY_STYLE, type AuditReport, type Finding } from "@aegiscore/core";

function FindingCard({ finding, index }: { finding: Finding; index: number }) {
  const style = SEVERITY_STYLE[finding.severity];

  return (
    <article className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 transition-colors hover:border-white/20">
      <header className="flex items-start gap-3">
        <span className="mt-0.5 font-mono text-[10px] text-slate-600">{String(index + 1).padStart(2, "0")}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider", style.badge)}>
              {style.label}
            </span>
            <span className="text-[11px] font-medium tabular-nums text-slate-500">{finding.score}/100</span>
            <span className="text-[11px] text-slate-600">·</span>
            <span className="text-[11px] uppercase tracking-wide text-slate-500">{finding.category}</span>
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-slate-500">
              <MapPin className="h-3 w-3" />
              {finding.location}
            </span>
          </div>
          <h3 className="mt-1.5 text-sm font-semibold text-slate-100">{finding.title}</h3>
        </div>
      </header>

      {finding.evidence && (
        <pre className="scroll-slim mt-2.5 overflow-x-auto rounded-lg border border-white/5 bg-black/40 px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-300">
          <code>{finding.evidence}</code>
        </pre>
      )}

      <p className="mt-2 text-xs leading-relaxed text-slate-400">{finding.explanation}</p>

      <p className="mt-2 flex gap-1.5 text-xs leading-relaxed text-slate-300">
        <span className="font-semibold text-emerald-300">Fix</span>
        <span className="text-slate-400">{finding.recommendation}</span>
      </p>
    </article>
  );
}

export function FindingsPanel({ report }: { report: AuditReport }) {
  if (report.findings.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div>
          <p className="text-sm font-medium text-emerald-300">No material findings</p>
          <p className="mt-1 text-xs text-slate-500">
            The deterministic rule set matched nothing in this {report.domainLabel.toLowerCase()} artefact.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="scroll-slim h-full overflow-y-auto p-3">
      <div className="space-y-2.5">
        {report.findings.map((finding, index) => (
          <FindingCard key={finding.id} finding={finding} index={index} />
        ))}
      </div>
    </div>
  );
}
