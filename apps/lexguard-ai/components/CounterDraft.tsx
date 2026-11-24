"use client";

import { useState } from "react";
import { Check, Copy, Download, FileSignature, PenLine } from "lucide-react";
import { copyText, downloadTextFile, type AuditReport } from "@aegiscore/core";

export function CounterDraft({ report }: { report: AuditReport }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const ok = await copyText(report.repairedDocument);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.08] px-3 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-400">
          <FileSignature className="h-3.5 w-3.5 text-amber-300" />
          Counter-proposal &amp; audit notice
        </span>
        <span className="rounded bg-amber-400/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-200">
          {report.patches.length} redlines
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium text-slate-200 transition-colors hover:border-amber-300/40 hover:text-amber-200"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy draft"}
          </button>
          <button
            type="button"
            onClick={() =>
              downloadTextFile(
                `lexguard-counter-draft-${report.id}.txt`,
                report.repairedDocument,
                "text/plain",
              )
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400/15 px-2.5 py-1.5 text-[11px] font-medium text-amber-200 ring-1 ring-amber-300/30 transition-colors hover:bg-amber-400/25"
          >
            <Download className="h-3.5 w-3.5" />
            Export draft
          </button>
        </div>
      </div>

      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto p-4">
        <div className="paper mx-auto max-w-[760px] p-6 animate-ink-in sm:p-8">
          <div className="mb-4 flex items-center gap-2 border-b border-[#121826]/10 pb-3">
            <PenLine className="h-3.5 w-3.5 text-[#7a5c1e]" />
            <span className="font-serif text-[10px] uppercase tracking-[0.22em] text-[#7a5c1e]">
              AegisCore · prepared for signature review
            </span>
          </div>
          <pre className="whitespace-pre-wrap font-serif text-[12.5px] leading-[1.75] text-[#121826]">
            {report.repairedDocument}
          </pre>
        </div>
      </div>
    </div>
  );
}
