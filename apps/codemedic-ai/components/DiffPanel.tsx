"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Download, GitCompare } from "lucide-react";
import { cn, copyText, diffDocuments, downloadTextFile, type AuditReport } from "@aegiscore/core";

const ROW_STYLE = {
  same: { left: "", right: "" },
  modify: { left: "bg-rose-500/10", right: "bg-emerald-500/10" },
  remove: { left: "bg-rose-500/10", right: "bg-white/[0.01]" },
  add: { left: "bg-white/[0.01]", right: "bg-emerald-500/10" },
} as const;

export function DiffPanel({ original, report }: { original: string; report: AuditReport }) {
  const [copied, setCopied] = useState(false);
  const diff = useMemo(() => diffDocuments(original, report.repairedDocument), [original, report.repairedDocument]);

  const copyPatched = async () => {
    const ok = await copyText(report.repairedDocument);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const download = () => {
    downloadTextFile(`codemedic-audit-${report.id}.md`, report.markdown, "text/markdown");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-400">
          <GitCompare className="h-3.5 w-3.5" />
          Original → patched
        </span>
        <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
          +{diff.stats.added}
        </span>
        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">
          ~{diff.stats.modified}
        </span>
        <span className="rounded bg-rose-500/10 px-1.5 py-0.5 font-mono text-[10px] text-rose-300">
          -{diff.stats.removed}
        </span>
        {diff.coarse && <span className="text-[10px] text-slate-500">index-aligned (large file)</span>}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={copyPatched}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium text-slate-200 transition-colors hover:border-cyan-400/40 hover:text-cyan-200"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy patched code"}
          </button>
          <button
            type="button"
            onClick={download}
            className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500/15 px-2.5 py-1.5 text-[11px] font-medium text-cyan-200 ring-1 ring-cyan-400/30 transition-colors hover:bg-cyan-500/25"
          >
            <Download className="h-3.5 w-3.5" />
            Audit report
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x divide-white/10 border-b border-white/10 bg-black/20 text-[10px] uppercase tracking-wider text-slate-500">
        <div className="px-3 py-1.5">Original (vulnerable)</div>
        <div className="px-3 py-1.5">Patched (secure)</div>
      </div>

      <div className="scroll-slim min-h-0 flex-1 overflow-auto font-mono text-[11.5px] leading-[1.55]">
        {diff.rows.map((row, index) => (
          <div key={index} className="grid grid-cols-2 divide-x divide-white/5">
            <div className={cn("flex min-w-0", ROW_STYLE[row.kind].left)}>
              <span className="w-10 shrink-0 select-none border-r border-white/5 px-1.5 text-right text-slate-700">
                {row.left?.no ?? ""}
              </span>
              <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words px-2 text-slate-300">
                {row.left?.text ?? ""}
              </pre>
            </div>
            <div className={cn("flex min-w-0", ROW_STYLE[row.kind].right)}>
              <span className="w-10 shrink-0 select-none border-r border-white/5 px-1.5 text-right text-slate-700">
                {row.right?.no ?? ""}
              </span>
              <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words px-2 text-slate-300">
                {row.right?.text ?? ""}
              </pre>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
