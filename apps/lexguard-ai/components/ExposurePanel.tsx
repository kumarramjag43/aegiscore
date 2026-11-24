"use client";

import { Banknote, CircleAlert, ShieldCheck } from "lucide-react";
import { BAND_COLOR, BAND_LABEL, cn, formatMoney, type AuditReport } from "@aegiscore/core";

export function ExposurePanel({ report }: { report: AuditReport }) {
  const exposure = report.risk.exposure;

  return (
    <div className="panel-ink p-4">
      <div className="flex items-center gap-2">
        <Banknote className="h-4 w-4 text-amber-300" />
        <h2 className="font-serif text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
          Financial exposure
        </h2>
        <span className={cn("ml-auto font-mono text-[10px]", BAND_COLOR[report.risk.band])}>
          {report.risk.score}/100 · {BAND_LABEL[report.risk.band]}
        </span>
      </div>

      {exposure ? (
        <>
          <p className="mt-3 font-serif text-[26px] font-semibold leading-none tracking-tight text-amber-200">
            {formatMoney(exposure.low, exposure.currency)}
            <span className="mx-1 text-base font-normal text-slate-500">–</span>
            {formatMoney(exposure.high, exposure.currency)}
          </p>
          <p className="mt-2 text-[10.5px] leading-relaxed text-slate-500">{exposure.basis}</p>
        </>
      ) : (
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          No quantified amounts were found in this instrument. Exposure is qualitative — see the findings.
        </p>
      )}

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-700",
            report.risk.band === "critical"
              ? "bg-rose-500"
              : report.risk.band === "severe"
                ? "bg-orange-500"
                : report.risk.band === "elevated"
                  ? "bg-amber-400"
                  : "bg-emerald-400",
          )}
          style={{ width: `${Math.max(6, report.risk.score)}%` }}
        />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-2 py-1.5">
          <p className="text-[9px] uppercase tracking-wider text-slate-500">Findings</p>
          <p className="text-sm font-semibold text-slate-100">{report.findings.length}</p>
        </div>
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-2 py-1.5">
          <p className="text-[9px] uppercase tracking-wider text-slate-500">Redlines</p>
          <p className="text-sm font-semibold text-slate-100">{report.patches.length}</p>
        </div>
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-2 py-1.5">
          <p className="text-[9px] uppercase tracking-wider text-slate-500">Checks</p>
          <p className="text-sm font-semibold text-slate-100">
            {report.verification.checks.filter((check) => check.passed).length}/{report.verification.checks.length}
          </p>
        </div>
      </div>

      <p
        className={cn(
          "mt-3 flex items-start gap-1.5 rounded-lg border px-2 py-1.5 text-[10.5px] leading-snug",
          report.verification.passed
            ? "border-emerald-400/25 bg-emerald-400/5 text-emerald-200"
            : "border-amber-400/25 bg-amber-400/5 text-amber-200",
        )}
      >
        {report.verification.passed ? (
          <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
        ) : (
          <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />
        )}
        <span>
          {report.verification.passed ? "Verifier signed" : "Verifier flagged gaps"} ·{" "}
          {report.verification.confidence}% confidence · {report.provider.label}
        </span>
      </p>
    </div>
  );
}
