---
title: "How We Built AegisCore: One Multi-Agent Skeleton Powering Both DevSecOps and Legal AI Using Kiro"
published: false
description: "A four-agent audit engine that knows nothing about SQL or indemnity clauses — and still ships two products. Architecture, verification, the bugs that cost us a day, and how Kiro's specs, steering and hooks kept one core from quietly becoming two."
tags: ai, typescript, architecture, showdev
---

# How We Built AegisCore: One Multi-Agent Skeleton Powering Both DevSecOps and Legal AI Using Kiro

Every "multi-agent" demo I have seen at a hackathon follows the same arc: a slick prompt
chain, a beautiful UI, and one domain hard-wired into both. Change the domain and the whole
thing collapses, because the agents were never really an *engine* — they were a script with
prose in the middle.

AegisCore started from the opposite constraint. We entered a category that demands one
reusable core powering more than one product. So we picked two domains with nothing in
common — application security and commercial contracts — and refused to write the pipeline
twice.

## The insight: separate the workflow from the vocabulary

Contract review and code review are the same five steps wearing different clothes:

1. read an artefact,
2. locate the parts that can hurt you,
3. score them,
4. produce a safe replacement,
5. prove the replacement is actually safe.

Step 5 is the one everybody skips. So we made it a first-class agent — and, crucially, a
**deterministic** one.

That gave us the seam. A domain supplies only the vocabulary:

```ts
export interface DomainPack {
  id: string;
  label: string;
  presets: Preset[];                                   // one-click demo inputs
  agents: Record<AgentStage, AgentDescriptor>;         // names, roles, colours
  prompts: Record<AgentStage, (ctx) => PromptPair>;
  sandbox: { scan(input): ScanResult; heal(ctx): HealResult };
  detect(input: string): Finding[];                    // verification oracle
  verify(ctx: PipelineContext): VerificationCheck[];
}
```

Two packs implement it — `code-security` (14 detectors) and `contract-fraud` (13 commercial
signals plus an invoice reconciler). Two Next.js apps consume the core. Neither app contains
a prompt, a detector, or a pipeline stage. Delete one app and the other still builds.

## The pipeline

```
scanner → risk critic → auto-healer → verifier
   │           │             │            │
chunks    0-100 scores   rewritten     re-runs detectors,
+ anchors + evidence     artefact      checks invariants
```

Everything is streamed as typed Server-Sent Events (`run.started`, `stage.started`,
`stage.log`, `stage.completed`, `report.ready`, `run.completed`, `run.failed`). The dark
DevSecOps console renders that stream as a terminal; the executive legal desk renders the
same stream as a vertical timeline with durations. Same events, two audiences.

Two decisions did most of the work:

**Severity is derived, never trusted.** Models love to announce "risk: 9/10" and then list
three trivial findings. We compute the headline ourselves:

```ts
risk = Math.min(100, topScore + 0.25 * sum(remainingScores));
```

Breadth now matters more than a single scary score, and the model's own number is preserved
as `criticScore` for transparency without driving the gauge.

**The verifier is code, not a model.** After the healer rewrites a file, the same detectors
re-run against the patch. Anything still firing means `verification.passed === false`. It can
also check invariants the model cannot fake: balanced delimiters after a rewrite, no
credential left in the patch, every redline actually present in the generated
counter-proposal. An agent that is allowed to fail is the only reason "verified" means
anything on screen.

## Shipping a demo that works with zero API keys

Hackathon judges click first and read later. If your first screen says "enter an API key",
you have already lost. So the sandbox is not a mock — it is the *same* pipeline running
deterministic domain analyzers instead of a remote model:

```ts
export function resolveLlmClient(env: Env, pack: DomainPack): LlmClient {
  if (isDemoMode(env)) return createSandboxClient(pack);   // DEMO_MODE pins it
  for (const id of ["openai", "gemini", "groq", "anthropic"]) {
    const client = build(id);                              // plain fetch, no SDKs
    if (client) return client;
  }
  return createSandboxClient(pack);
}
```

Every finding, patch and score in the demo is computed by production code. Drop a key in
`.env` and the identical stages call the model instead, and the badge switches from
**Live Sandbox Engine Active** to `Live · <provider>`. A provider that times out or answers
with prose degrades to the sandbox for that stage, logs a `warn`, and adds a verification
note — the run still finishes.

## The bugs that actually cost us time

**Negative lookahead backtracking.** We wrote `/\s*,\s*(?!auth)/` to skip already-protected
routes. It kept matching `, authenticate(...)`, because `\s*` can match zero characters and
the engine happily backtracked. Anchoring the lookahead — `(?!\s*(?:auth|requireAuth))` — fixed
it. Lesson: assert on *what* matched, not that *something* matched.

**Invoice line items look exactly like clause headings.** `1. Sensor array — qty 12 x
$1,850.00 = $22,200` parses as heading `1.` with a body, so the entire invoice collapsed into
one giant "clause 3" and every downstream signal misfired. The parser now rejects candidate
headings that contain `=` or `qty N x` and falls back to paragraph mode for unlabelled
documents.

**Sentence extraction that trusted every period.** Clause `2.3` split into `2.` and
`3 Late payments…`, so findings quoted a sentence that did not exist. A period now only ends
a sentence when whitespace and an upper-case character follow.

**Exposure that only looked at flagged clauses.** A loan agreement flagged a $15,000 fee and
reported $15,000 of exposure while the principal was $250,000. The floor is now the largest
quantified commitment anywhere in the instrument, with a stated 2.5× downside multiplier.

None of these were prompt problems. They were domain-model problems, and they were only
findable because the pipeline is testable offline: 32 `node:test` cases run the real
pipeline with `pace: 0` and an injectable provider in about 300 ms.

## How Kiro shaped the build

Kiro's spec-driven workflow fits a "one core, many products" constraint better than free-form
chat, for one reason: the artefacts are reviewable.

- **Specs (`EARS`).** `requirements.md` states 26 requirements as *WHEN / WHILE / WHERE / IF …
  THEN the system shall …*, each with acceptance criteria. "Severity is derived from the score
  by one shared function" is a requirement, not a vibe, so a second app cannot invent its own
  scale.
- **Steering.** `architecture-rules.md` encodes the Skeleton Crew contract: dependency
  direction is one-way, the core may never import an app, adding a domain requires exactly
  three edits, and UI may share semantic tokens but never a visual language. That last rule is
  why the two products look like different companies built them.
- **Hooks.** `auto-audit-on-save.json` runs `npm run audit:quick` whenever a core, pack or app
  source file is saved; `pre-commit-audit.json` gates the commit on `npm run verify`
  (typecheck × 4 workspaces, tests, three production builds). A reusable core only stays
  reusable if the second product cannot silently drift.
- **Task log.** `tasks.md` records the checklist *and* the deliberate omissions — no
  persistence, no auth, stage-level streaming only. Writing down what you chose not to build
  is the cheapest way to sound credible in a demo.

We also kept a 64-row edge-case matrix (`test-matrix.md`) mapping every boundary — empty
input, binary uploads, path traversal in filenames, provider returning prose, duplicate
detector hits, invoice arithmetic — to the test or browser check that proves it.

## What we shipped

Three surfaces from one skeleton: a launcher portal that renders the core's own registry
(real detector counts, not marketing numbers), a dark DevSecOps console that diffs buggy code
against the healed version and downloads the fixed file under its original name, and an
executive audit desk that quantifies financial exposure, exports a signature-ready
counter-proposal, and prints a clean A4 PDF.

Seventeen requirements' worth of scope creep later, the thing we are proudest of is boring:
the second product really is a data file. Adding a third industry — say, insurance policy
review — means one directory and one export line. The four agents, the scoring model, the
diff engine, the verification loop and the SSE stream are already there.

That is what a skeleton is for.

---

*AegisCore is MIT licensed. Run it with `npm install && npm run dev` — no API key required.*
