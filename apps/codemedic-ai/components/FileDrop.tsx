"use client";

import { useCallback, useRef, useState } from "react";
import { FileCode2, Loader2, Upload, X } from "lucide-react";
import { cn, formatBytes, readUploadedText, type UploadRule, type UploadedText } from "@aegiscore/core";

export interface FileDropProps {
  rule: UploadRule;
  accept: string;
  hint: string;
  file: { name: string; bytes: number } | null;
  disabled?: boolean;
  onLoaded: (file: UploadedText) => void;
  onError: (message: string) => void;
  onClear: () => void;
}

/** Drag-and-drop source intake that hands the raw text to the audit editor. */
export function FileDrop({ rule, accept, hint, file, disabled, onLoaded, onError, onClear }: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);

  const ingest = useCallback(
    async (files: FileList | null) => {
      const candidate = files?.[0];
      if (!candidate || disabled) return;
      setReading(true);
      try {
        const result = await readUploadedText(candidate, rule);
        if (result.ok) onLoaded(result);
        else onError(result.error ?? "That file could not be read.");
      } catch {
        onError("The browser could not read that file.");
      } finally {
        setReading(false);
      }
    },
    [disabled, onError, onLoaded, rule],
  );

  if (file) {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-400/[0.07] px-2.5 py-2">
        <FileCode2 className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-cyan-100">{file.name}</span>
        <span className="shrink-0 font-mono text-[10px] text-cyan-400/70">{formatBytes(file.bytes)}</span>
        <button
          type="button"
          onClick={onClear}
          title="Detach file"
          className="shrink-0 rounded p-0.5 text-cyan-300/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void ingest(event.dataTransfer.files);
      }}
      className={cn(
        "mt-2 flex items-center gap-2 rounded-lg border border-dashed px-2.5 py-2 transition-colors",
        dragging
          ? "border-cyan-400/70 bg-cyan-400/10"
          : "border-white/15 bg-white/[0.015] hover:border-cyan-400/40",
        disabled && "opacity-50",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => {
          void ingest(event.target.files);
          event.target.value = "";
        }}
      />
      {reading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" />
      ) : (
        <Upload className="h-3.5 w-3.5 text-slate-500" />
      )}
      <button
        type="button"
        disabled={disabled || reading}
        onClick={() => inputRef.current?.click()}
        className="text-[10.5px] font-medium text-slate-300 transition-colors hover:text-cyan-200"
      >
        {reading ? "Reading file…" : "Drop a source file"}
      </button>
      <span className="truncate text-[10px] text-slate-600">{hint}</span>
    </div>
  );
}
