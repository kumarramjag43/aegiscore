"use client";

import { useState } from "react";
import { Check, Copy, FileJson, FileText } from "lucide-react";
import { cn, copyText, downloadTextFile, type AuditReport } from "@aegiscore/core";

export function ReportPanel({ report }: { report: AuditReport }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const ok = await copyText(report.markdown);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.08] px-3 py-2.5">
        <span className="text-[11px] uppercase tracking-wider text-slate-400">Markdown audit report</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium text-slate-200 transition-colors hover:border-amber-300/40 hover:text-amber-200"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={() => downloadTextFile(`lexguard-audit-${report.id}.md`, report.markdown, "text/markdown")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium text-slate-200 transition-colors hover:border-amber-300/40 hover:text-amber-200"
          >
            <FileText className="h-3.5 w-3.5" />
            .md
          </button>
          <button
            type="button"
            onClick={() =>
              downloadTextFile(`lexguard-audit-${report.id}.json`, JSON.stringify(report, null, 2), "application/json")
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400/15 px-2.5 py-1.5 text-[11px] font-medium text-amber-200 ring-1 ring-amber-300/30 transition-colors hover:bg-amber-400/25"
          >
            <FileJson className="h-3.5 w-3.5" />
            .json
          </button>
        </div>
      </div>

      <div className="border-b border-white/[0.08] px-3 py-2">
        <ul className="grid gap-1 sm:grid-cols-2">
          {report.verification.checks.map((check) => (
            <li key={check.id} className="flex items-start gap-1.5 text-[11px] leading-snug">
              <span className={cn("mt-0.5 shrink-0", check.passed ? "text-emerald-400" : "text-rose-400")}>
                {check.passed ? "✓" : "×"}
              </span>
              <span className="text-slate-400">
                <span className="text-slate-300">{check.label}</span> — {check.detail}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <pre className="scroll-slim min-h-0 flex-1 overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-[11.5px] leading-relaxed text-slate-300">
        {report.markdown}
      </pre>
    </div>
  );
}
