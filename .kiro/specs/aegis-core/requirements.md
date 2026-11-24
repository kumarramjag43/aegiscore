# AegisCore — Requirements

**Status:** Implemented · **Version:** 1.0.0 · **Spec style:** EARS (Easy Approach to Requirements Syntax)

AegisCore is a domain-agnostic multi-agent audit engine. It is delivered as one reusable
package (`packages/aegis-core`) and is proven by two independent products that contribute
only domain knowledge:

| Product | Package | Domain pack | Port |
| --- | --- | --- | --- |
| CodeMedic AI | `apps/codemedic-ai` | `code-security` | 3001 |
| LexGuard AI | `apps/lexguard-ai` | `contract-fraud` | 3002 |

---

## 1. Skeleton Crew requirement

### R1 — Single reusable core (Ubiquitous)

**The system shall** expose exactly one orchestration implementation, published as the
workspace package `@aegiscore/core`, and both applications shall import it without forking,
patching, or duplicating pipeline logic.

*Acceptance criteria*

- `packages/aegis-core/src` contains the only implementation of the four pipeline stages.
- Neither application contains a stage implementation, a prompt template, or a detector.
- `grep -r "scan(" apps/*/components` returns no results.
- Deleting either application leaves the other application fully functional.

### R2 — Domain packs are data, not code paths (Ubiquitous)

**The system shall** allow a new domain to be added by implementing the `DomainPack`
interface only, with zero changes to core files.

*Acceptance criteria*

- `DomainPack` declares `presets`, `agents`, `prompts`, `sandbox`, `detect`, `verify`,
  `actionLabel`, `documentNoun`, and `domainLabel`.
- Adding a pack requires editing exactly one new directory plus one export line in
  `packages/aegis-core/src/index.ts`.
- Core contains no `if (domain === ...)` branching.

---

## 2. Pipeline

### R3 — Ordered four-agent execution (Event-driven)

**WHEN** an audit is requested, **the system shall** execute the stages `scanner`,
`critic`, `healer`, `verifier` in that order, exactly once each, and shall not start a
stage before the previous stage has completed.

*Acceptance criteria*

- The event stream contains exactly four `stage.started` and four `stage.completed` events.
- `stage.completed` for stage *n* always precedes `stage.started` for stage *n + 1*.

### R4 — Scanner output (Event-driven)

**WHEN** the scanner completes, **the system shall** emit a `ScanResult` containing the
input size, a chunk list with 1-based line anchors, and structural counts (imports,
functions, routes, clauses).

*Acceptance criteria*

- Every chunk has `id`, `label`, `startLine`, `endLine`, `kind`, and `text`.
- `startLine <= endLine` and both are within the input.
- Route, function, and clause counts are reported in the stage summary.

### R5 — Critic scoring (Event-driven)

**WHEN** the scanner completes, **the system shall** produce findings where each finding
carries a `score` in `[0, 100]`, a derived `severity`, a human location, verbatim evidence,
an explanation, and a recommendation; and **the system shall** compute the run-level risk
score from those findings, not from the model's self-assessment.

*Acceptance criteria*

- `severity` is derived from `score` by one shared function (`severityFromScore`).
- Run-level score = `top score + 0.25 × (sum of remaining scores)`, capped at 100.
- Model-supplied `riskScore` is retained as `criticScore` and never overrides the aggregate.
- Findings are sorted by descending score.

### R6 — Healer output (Event-driven)

**WHEN** the critique completes, **the system shall** produce a repaired document and a
patch list where each patch records the exact original text, the exact replacement text,
and the rationale.

*Acceptance criteria*

- `patches[].original` is present verbatim in the input document.
- `patches[].replacement` is present verbatim (modulo indentation) in the repaired document.
- Code domain: the repaired document is valid, balanced source with the vulnerability removed.
- Contract domain: the repaired document is a complete counter-proposal containing every
  redline plus protective terms and a reservation of rights.

### R7 — Independent verification (Event-driven)

**WHEN** the healer completes, **the system shall** re-run the deterministic detectors
against the repaired document, evaluate a domain invariant set, and emit
`verification.passed`, `verification.confidence`, and per-check results.

*Acceptance criteria*

- Code domain checks: residual critical detectors, delimiter balance, credential leakage,
  patch presence.
- Contract domain checks: liability cap present, mutual termination present, every redline
  present in the counter-document, reservation of rights, quantified reconciliation.
- Confidence is reduced for every failed check and for any run that used a fallback.
- A failed verification is reported to the user; it is never silently swallowed.

### R8 — Real-time streaming (State-driven)

**WHILE** the pipeline executes, **the system shall** stream Server-Sent Events so the UI can
render agent activity before the run finishes.

*Acceptance criteria*

- Events: `run.started`, `stage.started`, `stage.log`, `stage.completed`, `report.ready`,
  `run.completed`, `run.failed`.
- Every `data:` payload is a single-line JSON object.
- The stream emits `retry: 3000` and sets `cache-control: no-store`.
- The stream terminates cleanly on completion and on client abort.

---

## 3. Providers

### R9 — Pluggable LLM providers (Optional)

**WHERE** a provider API key is present in the environment, **the system shall** route stage
calls to that provider using a plain `fetch` request with a per-call timeout.

*Acceptance criteria*

- Supported: OpenAI, Groq (OpenAI-compatible), Google Gemini, Anthropic Claude.
- Selection order is explicit and documented; `AEGIS_PROVIDER` overrides it.
- No SDK dependency is required for any provider.
- `GET /api/health` reports the active provider and its mode.

### R10 — Sandbox mode (Ubiquitous)

**The system shall** run the complete pipeline with no API key, using deterministic
domain analyzers that produce the same report shape as a live provider.

*Acceptance criteria*

- Fresh clone + `npm install` + `npm run dev` produces a full, credible audit with no keys.
- Sandbox output is deterministic for a given input.
- The UI labels the provider as sandbox so judges know what they are seeing.

### R11 — Graceful degradation (Unwanted behaviour)

**IF** a live provider fails, times out, or returns output that cannot be parsed into the
expected schema, **THEN** the system shall fall back to the deterministic analyzer for that
stage, emit a `warn` log line, and record a verification note — without failing the run.

*Acceptance criteria*

- A provider returning prose instead of JSON yields a complete, verified report.
- The fallback is visible in the live terminal and in `verification.notes`.

---

## 4. Reporting

### R12 — Dual-format report (Ubiquitous)

**The system shall** produce a structured JSON report and a Markdown report from the same
run, and the UI shall offer copy and download for both.

*Acceptance criteria*

- JSON includes `id`, `domain`, `input`, `repairedDocument`, `findings`, `patches`, `risk`,
  `verification`, `provider`, `stageDurations`, `totalMs`.
- Markdown includes executive summary, findings table, patch detail, verification results,
  and the repaired artefact.
- The report is downloadable as `.md` and `.json` from both applications.

---

## 5. Applications

### R13 — CodeMedic AI (Ubiquitous)

**The system shall** provide a dark DevSecOps console on port 3001 with: code/API input,
three one-click vulnerable presets, live agent terminal, side-by-side diff, copy-patched-code,
and report download.

*Acceptance criteria*

- Presets: SQL injection API, exposed key + auth bypass, async race condition.
- Each preset produces distinct findings and a genuinely different, correct patch.
- The diff view shows original and patched code side by side with change markers.

### R14 — LexGuard AI (Ubiquitous)

**The system shall** provide an executive legal/finance console on port 3002 with: document
input, three one-click presets, live agent timeline, red-flag heatmap, quantified exposure,
and an exportable counter-proposal.

*Acceptance criteria*

- Presets: predatory vendor contract, inflated tax invoice, hidden loan traps.
- The invoice preset is reconciled arithmetically (VAT recomputed, total corrected).
- Exposure is quantified in the document's currency with a stated basis.
- The counter-draft is exportable as a text document.

---

## 6. Safety and quality

### R15 — Input limits (Unwanted behaviour)

**IF** the request body is missing, empty, not a string, or longer than
`AEGIS_MAX_INPUT_CHARS`, **THEN** the system shall reject it with a 400 response or a
`run.failed` event carrying a human-readable message.

### R16 — Secret hygiene (Ubiquitous)

**The system shall** never place API keys, tokens, or credential-shaped strings into logs,
events, reports, or error messages.

*Acceptance criteria*

- `redactSecrets` is applied to every provider error message before it is surfaced.
- `console.log` of credential-bearing source lines is rewritten to a neutral message by the
  auto-healer.
- No `.env` file is committed; `.env.example` documents every variable.

### R17 — Zero-defect build (Ubiquitous)

**The system shall** typecheck, test, and build with zero errors.

*Acceptance criteria*

- `npm run typecheck` → 0 errors across all workspaces.
- `npm test` → all core tests pass.
- `npm run build` → both Next.js applications build successfully.

---

## 7. Extensibility (out of scope for v1, reserved)

- R18 — Persistence of runs (currently in-memory per request).
- R19 — Authentication and multi-tenancy.
- R20 — Streaming token-level model output.

These are explicitly **not** implemented; the design reserves seams for them.
