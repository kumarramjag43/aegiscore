import type { RiskBand, Severity } from "./types";

/**
 * Presentation tokens shared by both apps.
 *
 * Keeping severity colour and wording in the core is what stops CodeMedic and
 * LexGuard from drifting apart: one skeleton, one visual language. This module
 * must stay free of React and of any domain logic.
 */

export interface SeverityStyle {
  label: string;
  badge: string;
  bar: string;
  text: string;
  dot: string;
}

export const SEVERITY_STYLE: Record<Severity, SeverityStyle> = {
  critical: {
    label: "Critical",
    badge: "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/40",
    bar: "bg-rose-500",
    text: "text-rose-300",
    dot: "bg-rose-500",
  },
  high: {
    label: "High",
    badge: "bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/40",
    bar: "bg-orange-500",
    text: "text-orange-300",
    dot: "bg-orange-500",
  },
  medium: {
    label: "Medium",
    badge: "bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/40",
    bar: "bg-amber-400",
    text: "text-amber-300",
    dot: "bg-amber-400",
  },
  low: {
    label: "Low",
    badge: "bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/40",
    bar: "bg-sky-500",
    text: "text-sky-300",
    dot: "bg-sky-500",
  },
  info: {
    label: "Info",
    badge: "bg-slate-500/15 text-slate-300 ring-1 ring-slate-500/40",
    bar: "bg-slate-500",
    text: "text-slate-300",
    dot: "bg-slate-500",
  },
};

export const BAND_LABEL: Record<RiskBand, string> = {
  minimal: "Minimal",
  guarded: "Guarded",
  elevated: "Elevated",
  severe: "Severe",
  critical: "Critical",
};

export const BAND_COLOR: Record<RiskBand, string> = {
  minimal: "text-emerald-400",
  guarded: "text-sky-400",
  elevated: "text-amber-400",
  severe: "text-orange-400",
  critical: "text-rose-400",
};

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function formatTimestamp(at: number): string {
  const date = new Date(at);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(
    date.getSeconds(),
  ).padStart(2, "0")}.${String(date.getMilliseconds()).padStart(3, "0")}`;
}

export { formatMoney } from "./report";
