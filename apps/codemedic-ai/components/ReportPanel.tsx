"use client";

import { useState } from "react";
import { Check, Copy, Download, FileJson, FileText } from "lucide-react";
import { cn, copyText, downloadTextFile, SEVERITY_STYLE, type AuditReport } from "@aegiscore/core";

export function ReportPanel({ report }: { report: AuditReport }) {
  const [copied, setCopied] = useState(false);

  const copyMarkdown = async () => {
    const ok = await copyText(report.markdown);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2.5">
        <span className="text-[11px] uppercase tracking-wider text-slate-400">
          Markdown audit report · {report.verification.checks.filter((check) => check.passed).length}/
          {report.verification.checks.length} checks passed
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={copyMarkdown}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium text-slate-200 transition-colors hover:border-cyan-400/40 hover:text-cyan-200"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={() => downloadTextFile(`codemedic-audit-${report.id}.md`, report.markdown, "text/markdown")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium text-slate-200 transition-colors hover:border-cyan-400/40 hover:text-cyan-200"
          >
            <FileText className="h-3.5 w-3.5" />
            .md
          </button>
          <button
            type="button"
            onClick={() =>
              downloadTextFile(`codemedic-audit-${report.id}.json`, JSON.stringify(report, null, 2), "application/json")
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500/15 px-2.5 py-1.5 text-[11px] font-medium text-cyan-200 ring-1 ring-cyan-400/30 transition-colors hover:bg-cyan-500/25"
          >
            <FileJson className="h-3.5 w-3.5" />
            .json
          </button>
        </div>
      </div>

      <div className="border-b border-white/10 px-3 py-2">
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

      <div className="flex items-center gap-2 border-t border-white/10 px-3 py-2 text-[10px] text-slate-500">
        <Download className="h-3 w-3" />
        <span>
          Run {report.id} · {report.provider.label} · {report.totalMs} ms
        </span>
        <span className="ml-auto inline-flex items-center gap-1">
          <span className={cn("h-1.5 w-1.5 rounded-full", SEVERITY_STYLE[report.risk.severity].dot)} />
          {report.risk.score}/100
        </span>
      </div>
    </div>
  );
}
