import {
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  Cpu,
  Fingerprint,
  GitCompare,
  Layers,
  Printer,
  Radar,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Terminal,
  Workflow,
} from "lucide-react";
import { contractFraudPack, codeSecurityPack, DETECTORS, LEGAL_SIGNALS, PACKS } from "@aegiscore/core";
import { SkeletonDiagram } from "@/components/SkeletonDiagram";
import { probeEngine, type EngineStatus } from "@/lib/status";

// Status pills are live probes; never cache a stale engine state in the HTML.
export const dynamic = "force-dynamic";

// Server-side probe targets: a plain env var wins so the URL can change without
// a rebuild, then the public (build-time) one, then local development.
const CODEMEDIC_URL =
  process.env.CODEMEDIC_URL ?? process.env.NEXT_PUBLIC_CODEMEDIC_URL ?? "http://localhost:3001";
const LEXGUARD_URL =
  process.env.LEXGUARD_URL ?? process.env.NEXT_PUBLIC_LEXGUARD_URL ?? "http://localhost:3002";

const STAGE_CARDS = [
  {
    icon: Radar,
    index: "01",
    name: "Scanner",
    line: "Chunks the artefact with exact line and clause anchors.",
  },
  {
    icon: Fingerprint,
    index: "02",
    name: "Risk Critic",
    line: "Scores every flaw 0–100 and cites the exact evidence.",
  },
  {
    icon: Workflow,
    index: "03",
    name: "Auto-Healer",
    line: "Rewrites the artefact: bound parameters, redlined clauses.",
  },
  {
    icon: ShieldCheck,
    index: "04",
    name: "Verifier",
    line: "Re-runs the detectors on the fix and signs the report.",
  },
] as const;

const PACK_SNIPPET = `export const pack: DomainPack = {
  id: "your-domain",
  agents:     { scanner, critic, healer, verifier },
  presets:    [...],              // one-click demo inputs
  prompts:    { critic: buildCritiquePrompt, ... },
  sandbox:    { scan, heal },     // deterministic engine
  detect,                          // verification oracle
  verify,                          // domain invariants
};`;

export default async function PortalPage() {
  const [codemedic, lexguard] = await Promise.all([probeEngine(CODEMEDIC_URL), probeEngine(LEXGUARD_URL)]);
  const stats = [
    { label: "agent stages", value: "4", note: "shared by every domain" },
    { label: "detectors", value: String(DETECTORS.length), note: "code-security pack" },
    { label: "legal signals", value: String(LEGAL_SIGNALS.length), note: "contract-fraud pack" },
    { label: "domain packs", value: String(Object.keys(PACKS).length), note: "registered in one map" },
    { label: "unit tests", value: "40", note: "offline, deterministic" },
  ];

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="tower-grid pointer-events-none absolute inset-0" aria-hidden />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-[radial-gradient(60%_70%_at_50%_0%,rgba(139,92,246,0.18),transparent_70%)]"
        aria-hidden
      />

      <div className="relative mx-auto w-full max-w-[1180px] px-5 pb-16 pt-6 sm:px-8">
        <header className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5">
            <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-violet-500/15 ring-1 ring-violet-400/40">
              <Boxes className="h-5 w-5 text-violet-300" />
              <span className="absolute inset-0 rounded-xl ring-1 ring-violet-400/20 animate-pulse-ring" aria-hidden />
            </span>
            <div>
              <p className="text-[15px] font-semibold tracking-tight text-white">
                Aegis<span className="text-violet-400">Core</span>
              </p>
              <p className="text-[11px] text-slate-500">the skeleton, not the product</p>
            </div>
          </div>

          <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-wider text-slate-400 sm:inline-flex">
            <Sparkles className="h-3 w-3 text-violet-300" />
            Kiroween 2026 · Skeleton Crew
          </span>

          <div className="ml-auto flex items-center gap-2">
            <StatusPill name="CodeMedic" status={codemedic} />
            <StatusPill name="LexGuard" status={lexguard} />
          </div>
        </header>

        <section className="mt-14 max-w-[860px] animate-slide-up">
          <p className="text-[10.5px] uppercase tracking-[0.28em] text-violet-300/80">One core engine · two industries</p>
          <h1 className="mt-3 text-[34px] font-semibold leading-[1.08] tracking-tight text-white sm:text-[46px]">
            One skeleton.
            <br />
            <span className="bg-gradient-to-r from-violet-300 via-cyan-300 to-amber-200 bg-clip-text text-transparent">
              Two industries.
            </span>{" "}
            Zero duplicated agent logic.
          </h1>
          <p className="mt-5 max-w-[660px] text-[13.5px] leading-relaxed text-slate-400">
            AegisCore is a single four-agent audit engine — scanner, risk critic, auto-healer, verifier. It knows
            nothing about SQL injection or indemnity clauses. Domain packs supply the vocabulary; the same pipeline,
            scoring model, diff engine, verification loop and SSE stream then audit{" "}
            <span className="text-slate-200">production code</span> and{" "}
            <span className="text-slate-200">predatory contracts</span>.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <LaunchButton href={CODEMEDIC_URL} label="Launch CodeMedic AI" tone="cyan" meta=":3001 · DevSecOps" />
            <LaunchButton href={LEXGUARD_URL} label="Launch LexGuard AI" tone="amber" meta=":3002 · legal & finance" />
            <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              no API key required
            </span>
          </div>
        </section>

        <section className="mt-12">
          <SkeletonDiagram codemedicUrl={CODEMEDIC_URL} lexguardUrl={LEXGUARD_URL} />
        </section>

        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {stats.map((stat) => (
            <div key={stat.label} className="glass px-3 py-3">
              <p className="font-mono text-2xl font-semibold text-white">{stat.value}</p>
              <p className="mt-0.5 text-[10.5px] uppercase tracking-wider text-slate-400">{stat.label}</p>
              <p className="mt-0.5 text-[10px] text-slate-600">{stat.note}</p>
            </div>
          ))}
        </section>

        <section className="mt-14">
          <SectionTitle
            icon={Layers}
            eyebrow="The pipeline"
            title="Four agents, one contract, two domains"
            note="Every stage emits typed events, so any product can render the run however its users think."
          />
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STAGE_CARDS.map((stage) => {
              const Icon = stage.icon;
              return (
                <div key={stage.name} className="glass group p-4 transition-colors hover:border-violet-400/30">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-violet-300" />
                    <span className="font-mono text-[10px] text-slate-600">{stage.index}</span>
                    <span className="ml-auto rounded bg-white/[0.04] px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider text-slate-500">
                      shared
                    </span>
                  </div>
                  <p className="mt-2 text-[13px] font-semibold text-white">{stage.name}</p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-slate-500">{stage.line}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-14 grid gap-4 lg:grid-cols-2">
          <ProductCard
            tone="cyan"
            icon={Terminal}
            name="CodeMedic AI"
            tagline="Autonomous code & API security auditor"
            href={CODEMEDIC_URL}
            status={codemedic}
            bullets={[
              `${DETECTORS.length} detectors: SQLi, exposed keys, auth bypass, races, injection`,
              "Live agent terminal → side-by-side diff → copy patched code",
              "Drop a .ts/.py/.go/.java file, get the repaired file back",
              "Markdown + JSON audit report, signed by the verifier",
            ]}
          />
          <ProductCard
            tone="amber"
            icon={ScrollText}
            name="LexGuard AI"
            tagline="Contract, invoice & financial fraud intelligence"
            href={LEXGUARD_URL}
            status={lexguard}
            bullets={[
              `${LEGAL_SIGNALS.length} commercial red flags across clauses and invoices`,
              "Red-flag heatmap + quantified financial exposure range",
              "Invoice math reconciled line by line, not narrated",
              "Exportable counter-proposal and audit notice, print-ready PDF",
            ]}
          />
        </section>

        <section className="mt-14">
          <SectionTitle
            icon={Cpu}
            eyebrow="Skeleton Crew proof"
            title="The second product is a data file, not a fork"
            note="No core file branches on a domain. Adding a third industry is one directory and one export line."
          />
          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
            <div className="glass p-4">
              <ul className="space-y-2.5 text-[12px] leading-relaxed text-slate-400">
                <Proof text="packages/aegis-core owns the only implementation of the four stages, scoring, diff, verification, reports and SSE." />
                <Proof text="Neither app contains a prompt, a detector, or a pipeline stage — they import the core and render its typed events." />
                <Proof text="Sandbox analyzers run the same pipeline with no API key, so judges see real output before configuring anything." />
                <Proof text="The verifier is deterministic code that re-runs the detectors on the patch; it can fail, which is why &quot;verified&quot; means something." />
                <Proof text="40 offline tests cover both domains end to end: presets, clean-input false-positive guards, verifier rejection of broken fixes, and the fallback path when a live model returns prose." />
              </ul>
            </div>
            <pre className="glass overflow-x-auto p-4 font-mono text-[10.5px] leading-relaxed text-slate-300">
              <code>{PACK_SNIPPET}</code>
            </pre>
          </div>
        </section>

        <section className="mt-14 grid gap-3 sm:grid-cols-3">
          <MiniCard icon={GitCompare} title="Same score, same band" text="severityFromScore and aggregateRisk live in the core, so a SQL injection and an uncapped indemnity are ranked on one scale." />
          <MiniCard icon={Printer} title="Two audiences, two designs" text="A cyber console and an executive audit desk. They share semantic tokens, never a visual language." />
          <MiniCard icon={Terminal} title="One command" text="npm install && npm run dev boots this portal plus both products on 3000, 3001 and 3002." />
        </section>

        <footer className="mt-14 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/[0.07] pt-5 text-[10.5px] text-slate-600">
          <span className="text-slate-400">AegisCore</span>
          <span>·</span>
          <span>MIT licensed</span>
          <span>·</span>
          <span>Built for Kiroween 2026 — Skeleton Crew &amp; Best Demo</span>
          <span className="ml-auto inline-flex items-center gap-1.5">
            <Boxes className="h-3 w-3" />
            {Object.keys(PACKS).length} packs · 4 agents · 3 surfaces
          </span>
        </footer>
      </div>
    </main>
  );
}

function StatusPill({ name, status }: { name: string; status: EngineStatus }) {
  const tone =
    status.mode === "live"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
      : status.mode === "sandbox"
        ? "border-violet-400/30 bg-violet-400/10 text-violet-200"
        : "border-slate-600/40 bg-slate-500/10 text-slate-400";
  const dot =
    status.mode === "live" ? "bg-emerald-400" : status.mode === "sandbox" ? "bg-violet-400" : "bg-slate-500";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium ${tone}`}
      title={status.mode === "offline" ? `${name} is not reachable from this portal (${status.label})` : status.label}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {name}
      <span className="opacity-70">
        {status.mode === "live" ? "live" : status.mode === "sandbox" ? "sandbox" : "offline"}
      </span>
    </span>
  );
}

function LaunchButton({
  href,
  label,
  tone,
  meta,
}: {
  href: string;
  label: string;
  tone: "cyan" | "amber";
  meta: string;
}) {
  const skin =
    tone === "cyan"
      ? "bg-cyan-400 text-[#04141a] hover:bg-cyan-300 shadow-[0_16px_40px_-16px_rgba(34,211,238,0.75)]"
      : "bg-amber-300 text-[#231a04] hover:bg-amber-200 shadow-[0_16px_40px_-16px_rgba(251,191,36,0.7)]";

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[12.5px] font-semibold transition-colors ${skin}`}
    >
      {label}
      <ArrowUpRight className="h-3.5 w-3.5" />
      <span className="font-mono text-[10px] font-normal opacity-60">{meta}</span>
    </a>
  );
}

function SectionTitle({
  icon: Icon,
  eyebrow,
  title,
  note,
}: {
  icon: typeof Layers;
  eyebrow: string;
  title: string;
  note: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-violet-300" />
        <span className="text-[10.5px] uppercase tracking-[0.22em] text-slate-500">{eyebrow}</span>
      </div>
      <h2 className="mt-2 text-[22px] font-semibold tracking-tight text-white">{title}</h2>
      <p className="mt-1.5 max-w-[720px] text-[12.5px] leading-relaxed text-slate-500">{note}</p>
    </div>
  );
}

function ProductCard({
  tone,
  icon: Icon,
  name,
  tagline,
  href,
  status,
  bullets,
}: {
  tone: "cyan" | "amber";
  icon: typeof Terminal;
  name: string;
  tagline: string;
  href: string;
  status: EngineStatus;
  bullets: string[];
}) {
  const accent = tone === "cyan" ? "text-cyan-300" : "text-amber-200";
  const ring = tone === "cyan" ? "hover:border-cyan-400/40" : "hover:border-amber-300/40";
  const button =
    tone === "cyan"
      ? "bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-400/30 hover:bg-cyan-400/25"
      : "bg-amber-300/15 text-amber-100 ring-1 ring-amber-300/30 hover:bg-amber-300/25";

  return (
    <div className={`glass flex flex-col p-5 transition-colors ${ring}`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${accent}`} />
        <p className="text-[15px] font-semibold text-white">{name}</p>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-slate-500">
          {status.mode === "offline" ? "start locally" : status.mode}
        </span>
      </div>
      <p className="mt-1 text-[11.5px] text-slate-500">{tagline}</p>
      <ul className="mt-3 space-y-1.5">
        {bullets.map((bullet) => (
          <li key={bullet} className="flex gap-2 text-[11.5px] leading-relaxed text-slate-400">
            <CheckCircle2 className={`mt-0.5 h-3 w-3 shrink-0 ${accent}`} />
            {bullet}
          </li>
        ))}
      </ul>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11.5px] font-semibold transition-colors ${button}`}
      >
        Open {name}
        <ArrowUpRight className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

function Proof({ text }: { text: string }) {
  return (
    <li className="flex gap-2">
      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
      <span>{text}</span>
    </li>
  );
}

function MiniCard({ icon: Icon, title, text }: { icon: typeof Layers; title: string; text: string }) {
  return (
    <div className="glass p-4">
      <Icon className="h-4 w-4 text-violet-300" />
      <p className="mt-2 text-[12.5px] font-semibold text-white">{title}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{text}</p>
    </div>
  );
}
