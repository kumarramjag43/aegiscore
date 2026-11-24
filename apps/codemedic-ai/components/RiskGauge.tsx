"use client";

import { BAND_LABEL, cn, countBySeverity, SEVERITY_STYLE, type AuditReport } from "@aegiscore/core";

const BAND_STROKE: Record<string, string> = {
  minimal: "#34d399",
  guarded: "#38bdf8",
  elevated: "#fbbf24",
  severe: "#fb923c",
  critical: "#fb7185",
};

export function RiskGauge({ report }: { report: AuditReport }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - report.risk.score / 100);
  const stroke = BAND_STROKE[report.risk.band] ?? "#38bdf8";
  const counts = countBySeverity(report.findings);

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-5">
      <div className="relative h-[132px] w-[132px] shrink-0">
        <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
          <circle cx="64" cy="64" r={radius} fill="none" stroke="rgba(148,163,184,0.14)" strokeWidth="9" />
          <circle
            cx="64"
            cy="64"
            r={radius}
            fill="none"
            stroke={stroke}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 700ms ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold tabular-nums text-white">{report.risk.score}</span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">risk</span>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: stroke, backgroundColor: `${stroke}1a`, boxShadow: `inset 0 0 0 1px ${stroke}40` }}
          >
            {BAND_LABEL[report.risk.band]}
          </span>
          <span
            className={cn(
              "rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
              report.verification.passed
                ? "bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/30"
                : "bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/30",
            )}
          >
            {report.verification.passed ? "verified" : "needs review"} · {report.verification.confidence}%
          </span>
        </div>

        <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-400">{report.risk.verdict}</p>

        <dl className="mt-3 grid grid-cols-4 gap-1.5">
          {(["critical", "high", "medium", "low"] as const).map((severity) => (
            <div key={severity} className="rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1.5">
              <dt className={cn("text-[9px] uppercase tracking-wider", SEVERITY_STYLE[severity].text)}>
                {SEVERITY_STYLE[severity].label}
              </dt>
              <dd className="text-base font-semibold tabular-nums text-slate-100">{counts[severity]}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
