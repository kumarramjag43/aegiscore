# AegisCore — Tasks

All tasks below are **complete** and verified. Commands used for verification are listed in
§7.

## 1. Foundation

- [x] **T1.1** Create npm workspaces monorepo (`packages/*`, `apps/*`) with a single lockfile.
- [x] **T1.2** Add root scripts: `dev`, `dev:codemedic`, `dev:lexguard`, `build`, `start`,
      `typecheck`, `test`, `audit:quick`, `clean`.
- [x] **T1.3** Configure strict TypeScript (`strict`, `noUncheckedIndexedAccess`,
      `noImplicitOverride`) shared by every workspace.
- [x] **T1.4** Add `.gitignore` covering `node_modules`, `.next`, `dist`, `.env`.
- [x] **T1.5** Add `.env.example` documenting every provider and runtime knob.
- [x] **T1.6** Add MIT `LICENSE`.

## 2. Core contracts

- [x] **T2.1** Define `AgentStage`, `AgentDescriptor`, `Preset`, `DomainPack`.
- [x] **T2.2** Define `Finding`, `Patch`, `RiskSummary`, `MoneyExposure`, `VerificationCheck`.
- [x] **T2.3** Define `AuditReport` (the JSON contract shared by API, UI, and tests).
- [x] **T2.4** Define `AgentEvent` union (7 event types) and `ProviderInfo`.
- [x] **T2.5** Export a single barrel (`src/index.ts`) so apps import one specifier.

## 3. Core utilities

- [x] **T3.1** `json.ts` — brace-balanced JSON extraction from model prose and code fences.
- [x] **T3.2** `normalize.ts` — coerce untrusted model output into typed results; drop
      malformed findings; clamp scores to `[0, 100]`.
- [x] **T3.3** `scoring.ts` — `severityFromScore`, `bandFromScore`, compounding
      `aggregateRisk`, `countBySeverity`, `BAND_LABEL`, `SEVERITY_STYLE`.
- [x] **T3.4** `diff.ts` — LCS line diff with `same/modify/add/remove` classification,
      per-line numbering, unified hunks, and a coarse fallback above 800 lines.
- [x] **T3.5** `security.ts` — `clampInput`, `redactSecrets`, `isAbortError`.
- [x] **T3.6** `sse.ts` — `encodeSseFrame`, `createSseStream`, `consumeEventStream`.
- [x] **T3.7** `report.ts` — Markdown report builder (summary, table, patches, verification,
      artefact).
- [x] **T3.8** `client.ts` — `copyText`, `downloadTextFile` browser helpers.

## 4. Orchestration

- [x] **T4.1** `pipeline.ts` — `runAudit` async generator emitting the full event sequence.
- [x] **T4.2** Scanner stage: deterministic structure parsing, then optional model refinement.
- [x] **T4.3** Critic stage: prompt → JSON → normalize → aggregate risk → per-finding logs.
- [x] **T4.4** Healer stage: prompt → JSON → normalize → deterministic fallback.
- [x] **T4.5** Verifier stage: pack checks + detector re-run + confidence + notes.
- [x] **T4.6** `collectAudit` convenience wrapper for non-streaming callers and tests.
- [x] **T4.7** Injectable `llm` client and `pace` for deterministic, offline tests.
- [x] **T4.8** Abort propagation from `request.signal` into provider fetches.

## 5. Providers

- [x] **T5.1** `http.ts` — fetch with timeout, JSON errors, and secret redaction.
- [x] **T5.2** `openai.ts` — OpenAI and Groq via the chat-completions contract.
- [x] **T5.3** `gemini.ts` — `generateContent` with system instruction and JSON mime type.
- [x] **T5.4** `anthropic.ts` — Messages API with `system` + `max_tokens`.
- [x] **T5.5** `demo.ts` — sandbox client that signals deterministic mode.
- [x] **T5.6** `resolveLlmClient` — first configured provider wins; `AEGIS_PROVIDER` overrides.
- [x] **T5.7** `describeProviders` — safe inventory for `/api/health` (no secrets).

## 6. Domain packs

- [x] **T6.1** `code-security`: 8 detectors (SQLi concat, SQLi template, secrets, auth bypass,
      command injection, weak hashing, insecure randomness, verbose errors, race condition).
- [x] **T6.2** `code-security`: whole-document repair functions per detector family.
- [x] **T6.3** `code-security`: 3 presets — SQL injection API, exposed key + auth bypass,
      async race condition.
- [x] **T6.4** `contract-fraud`: 12 commercial/legal signals (uncapped liability, auto-renewal,
      unilateral pricing, perpetual IP, data sharing, one-sided termination, home-court
      jurisdiction, non-refundable fees, late fees, bank-detail changes, acceleration,
      fee deductions, strict covenants).
- [x] **T6.5** `contract-fraud`: clause parser (numbered, labelled, and paragraph fallback).
- [x] **T6.6** `contract-fraud`: invoice arithmetic reconciliation and duplicate/PO checks.
- [x] **T6.7** `contract-fraud`: counter-document builder with reservation of rights,
      per-clause redlines, protective terms, and next steps.
- [x] **T6.8** `contract-fraud`: 3 presets — predatory vendor contract, inflated tax invoice,
      hidden loan traps.
- [x] **T6.9** Both packs: agent descriptors, prompt builders, verification checks.

## 7. Applications

- [x] **T7.1** CodeMedic AI: dark DevSecOps console, port 3001.
- [x] **T7.2** CodeMedic AI: input + 3 presets + live agent terminal with stage rail.
- [x] **T7.3** CodeMedic AI: risk gauge, severity counters, findings cards with evidence.
- [x] **T7.4** CodeMedic AI: side-by-side diff with copy-patched and report download.
- [x] **T7.5** LexGuard AI: executive audit console, port 3002.
- [x] **T7.6** LexGuard AI: input + 3 presets + vertical agent timeline with durations.
- [x] **T7.7** LexGuard AI: red-flag heatmap with severity-tinted cards.
- [x] **T7.8** LexGuard AI: quantified exposure panel with basis and confidence.
- [x] **T7.9** LexGuard AI: paper-styled counter-draft with export.
- [x] **T7.10** Both apps: `POST /api/audit` SSE route and `GET /api/health` provider route.
- [x] **T7.11** Both apps: provider badge, cross-app link, skeleton-crew footer, SVG favicon.

## 8. Verification

- [x] **T8.1** `npm run typecheck` → 0 errors (core, both apps).
- [x] **T8.2** `npm test` → 25/25 core tests pass (32/32 after the Phase 2 upgrade).
- [x] **T8.3** `npm run build` → both Next.js apps compile and prerender.
- [x] **T8.4** SSE verified with `curl -N` against both apps (full event sequence).
- [x] **T8.5** Browser run of both UIs with zero console errors and zero failed requests.
- [x] **T8.6** Every preset produces findings, patches, and `verification.passed === true`.

## 9. Hackathon compliance

- [x] **T9.1** `.kiro/specs/aegis-core/requirements.md` (EARS).
- [x] **T9.2** `.kiro/specs/aegis-core/design.md` (architecture + Mermaid).
- [x] **T9.3** `.kiro/specs/aegis-core/tasks.md` (this file).
- [x] **T9.4** `.kiro/steering/architecture-rules.md` (Skeleton Crew modularity rules).
- [x] **T9.5** `.kiro/hooks/auto-audit-on-save.json` (Kiro agent hook).
- [x] **T9.6** Root `README.md` with the one-core/two-products story and one-command setup.

## 10. Known gaps (deliberately out of scope)

- [ ] Persistence of past runs (no database by design).
- [ ] Authentication and per-tenant isolation.
- [ ] Token-level streaming from providers (stage-level streaming only).
- [ ] Additional domain packs (a third pack is the natural next step and requires no core
      changes).

## 11. Phase 2 — hackathon polish (complete)

- [x] **T11.1** `apps/portal` on port 3000: hero, interactive SVG architecture map, live
      status pills, product cards, skeleton-proof section, stats read from the core.
- [x] **T11.2** `SkeletonDiagram` — hover / keyboard-focus / tap isolates the dependency path
      (core → pack → product) and animates the flow; app nodes open the live apps.
- [x] **T11.3** Portal status probes (`lib/status.ts`) with a 1.5 s timeout and graceful
      `offline` state; page is `force-dynamic` so a stale engine is never cached into HTML.
- [x] **T11.4** Core `readUploadedText` / `guessFileName` / `formatBytes` with extension,
      size, empty, binary and BOM handling; 7 new unit tests.
- [x] **T11.5** CodeMedic drag-and-drop intake (`.js .ts .tsx .mjs .cjs .py .go .java .json`)
      and "Download fixed file" under the original filename.
- [x] **T11.6** LexGuard attachment intake (`.txt .md .csv .json`) and
      "Print / Save as PDF" producing a chrome-free A4 executive audit.
- [x] **T11.7** `PrintSheet` artefact: metrics, findings table, counter-proposal, verification
      record, disclaimer; `@page A4` + `print-color-adjust` stylesheet.
- [x] **T11.8** `vercel.json` in all three apps (framework, security headers, `no-store` API).
- [x] **T11.9** `render.yaml` blueprint: three services, health checks, optional key slots.
- [x] **T11.10** `start` scripts honour `${PORT:-300x}` so hosted platforms can bind freely.
- [x] **T11.11** `DEMO_MODE` implemented in the core (`isDemoMode`) and precedence documented;
      both apps show **Live Sandbox Engine Active** when the sandbox is serving.
- [x] **T11.12** `/api/health` extended with `ok` and `demoMode`; `DEPLOY.md` written.
- [x] **T11.13** `.kiro/hooks/pre-commit-audit.json` (manual gate running `npm run verify`).
- [x] **T11.14** `.kiro/specs/aegis-core/test-matrix.md` — 64-row edge-case matrix.
- [x] **T11.15** `.kiro/specs/aegis-core/validation-log.md` — captured command output.
- [x] **T11.16** `BLOG_POST.md` — 1,200-word technical write-up for the Blog Post prize.
- [x] **T11.17** Root scripts: `dev`/`start` run three surfaces; `verify` = typecheck + test +
      build across four workspaces.
