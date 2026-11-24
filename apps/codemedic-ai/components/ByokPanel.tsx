"use client";

import { useEffect, useState } from "react";
import { ChevronDown, KeyRound } from "lucide-react";
import {
  BYOK_LABEL,
  BYOK_PROVIDERS,
  clearStoredByok,
  cn,
  loadStoredByok,
  saveStoredByok,
  validateByok,
  type ByokProvider,
  type StoredByok,
} from "@aegiscore/core";

const SELECTABLE = BYOK_PROVIDERS.filter((provider) => provider !== "anthropic");

interface ByokPanelProps {
  storageKey: string;
  onChange: (stored: StoredByok | null) => void;
}

/**
 * Optional live-model key for one browser session. The key lives in
 * `sessionStorage`, travels only in the audit request headers, and is never sent
 * anywhere else — the sandbox engine stays the default with no key at all.
 */
export function ByokPanel({ storageKey, onChange }: ByokPanelProps) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<ByokProvider>("gemini");
  const [keyInput, setKeyInput] = useState("");
  const [stored, setStored] = useState<StoredByok | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const restored = loadStoredByok(
      typeof window === "undefined" ? null : window.sessionStorage,
      storageKey,
    );
    if (restored) {
      setStored(restored);
      setProvider(restored.provider);
      onChange(restored);
    }
    // Runs once per mount; `onChange` is a stable state setter in both apps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const apply = () => {
    const validation = validateByok(provider, keyInput);
    if (!validation.ok) {
      setMessage(validation.reason);
      return;
    }
    const next: StoredByok = { provider: validation.provider, apiKey: validation.apiKey };
    saveStoredByok(typeof window === "undefined" ? null : window.sessionStorage, storageKey, next);
    setStored(next);
    setProvider(validation.provider);
    setKeyInput("");
    onChange(next);
    setMessage(`Live key armed for this tab · ${BYOK_LABEL[validation.provider]}`);
  };

  const clear = () => {
    clearStoredByok(typeof window === "undefined" ? null : window.sessionStorage, storageKey);
    setStored(null);
    setKeyInput("");
    onChange(null);
    setMessage("Key cleared — back to the deterministic sandbox.");
  };

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <KeyRound className="h-3.5 w-3.5 text-cyan-300" />
        <span className="text-[11px] font-medium text-slate-300">Use a live LLM key (optional)</span>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[9.5px] uppercase tracking-wider",
            stored
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
              : "border-slate-500/30 bg-slate-500/10 text-slate-400",
          )}
        >
          {stored ? `live · ${stored.provider}` : "sandbox default"}
        </span>
        <ChevronDown
          className={cn(
            "ml-auto h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div className="border-t border-white/5 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={provider}
              onChange={(event) => setProvider(event.target.value as ByokProvider)}
              aria-label="LLM provider"
              className="rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1.5 text-[11px] text-slate-200 outline-none focus:border-cyan-400/50"
            >
              {SELECTABLE.map((value) => (
                <option key={value} value={value}>
                  {BYOK_LABEL[value]}
                </option>
              ))}
            </select>
            <input
              type="password"
              value={keyInput}
              onChange={(event) => setKeyInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") apply();
              }}
              placeholder="Paste key — stays in this tab"
              aria-label="Provider API key"
              autoComplete="off"
              spellCheck={false}
              className="min-w-[180px] flex-1 rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1.5 font-mono text-[11px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-400/50"
            />
            <button
              type="button"
              onClick={apply}
              className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1.5 text-[11px] font-medium text-cyan-200 transition-colors hover:border-cyan-400/60"
            >
              Use key
            </button>
            {stored ? (
              <button
                type="button"
                onClick={clear}
                className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-slate-300 transition-colors hover:border-rose-400/40 hover:text-rose-200"
              >
                Clear
              </button>
            ) : null}
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
            Sent only with your audit request (<span className="font-mono">x-aegis-api-key</span>) and
            never stored on the server. If the provider rejects it, the run falls back to the
            deterministic sandbox instead of failing.
          </p>
          {message ? <p className="mt-1 text-[10px] text-cyan-300">{message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
