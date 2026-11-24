"use client";

import { MapPin } from "lucide-react";
import { cn, countBySeverity, SEVERITY_STYLE, type AuditReport, type Severity } from "@aegiscore/core";

const HEAT: Record<Severity, string> = {
  critical: "#f43f5e",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#0ea5e9",
  info: "#64748b",
};

export function RiskHeatmap({ report }: { report: AuditReport }) {
  const counts = countBySeverity(report.findings);

  if (report.findings.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-10 text-center">
        <div>
          <p className="font-serif text-sm text-emerald-300">No red flags detected</p>
          <p className="mt-1 text-xs text-slate-500">Counsel review is still recommended for commercial context.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="scroll-slim h-full overflow-y-auto p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="font-serif text-sm font-semibold text-slate-100">Red-flag heatmap</h2>
        <span className="text-[11px] text-slate-500">{report.findings.length} findings</span>
        <div className="ml-auto flex items-center gap-1.5">
          {(["critical", "high", "medium", "low"] as const).map((severity) => (
            <span
              key={severity}
              className={cn("rounded px-1.5 py-0.5 font-mono text-[10px]", SEVERITY_STYLE[severity].badge)}
            >
              {counts[severity]} {SEVERITY_STYLE[severity].label}
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {report.findings.map((finding) => {
          const color = HEAT[finding.severity];
          return (
            <article
              key={finding.id}
              className="relative overflow-hidden rounded-xl border border-white/[0.08] p-3 transition-colors hover:border-white/20"
              style={{ background: `linear-gradient(120deg, ${color}12, rgba(11,19,34,0.9) 55%)` }}
            >
              <span className="absolute inset-y-0 left-0 w-[3px]" style={{ backgroundColor: color }} aria-hidden />
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className="rounded px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider"
                      style={{ color, backgroundColor: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}40` }}
                    >
                      {SEVERITY_STYLE[finding.severity].label}
                    </span>
                    <span className="font-mono text-[10px] tabular-nums text-slate-500">{finding.score}</span>
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">{finding.category}</span>
                  </div>
                  <h3 className="mt-1.5 font-serif text-[13px] font-semibold leading-snug text-slate-100">
                    {finding.title}
                  </h3>
                </div>
              </div>

              <p className="mt-1.5 inline-flex items-center gap-1 text-[10.5px] text-slate-500">
                <MapPin className="h-3 w-3" />
                {finding.location}
              </p>

              <p className="mt-2 line-clamp-3 border-l border-white/10 pl-2 text-[11px] italic leading-relaxed text-slate-400">
                “{finding.evidence}”
              </p>

              <p className="mt-2 line-clamp-2 text-[10.5px] leading-relaxed text-slate-500">
                <span className="font-semibold text-slate-300">Counter-position: </span>
                {finding.recommendation}
              </p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
