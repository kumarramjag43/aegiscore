# Architecture Rules — Skeleton Crew

These rules exist because AegisCore is judged on one thing: **one core, two products, no
copy-paste**. Every rule below is enforced by review, and most are enforced by TypeScript or
tests. If a change violates a rule, change the design — not the rule.

---

## 1. Dependency direction (non-negotiable)

```
apps/*  ──depends on──▶  packages/aegis-core  ──depends on──▶  node built-ins only
   │                              ▲
   └──── domain packs live inside the core package, registered in src/index.ts
```

- An app may import from `@aegiscore/core` and from its own `components/`.
- The core may **never** import from `apps/*`.
- The core may **never** import a UI framework, a database driver, or an SDK.
- Domain packs may import from `../../types`, `../../normalize`, `../../scoring`, `../../diff`.
  They may not import the pipeline.

**Why:** the moment the core knows about Express routes or indemnity clauses, the skeleton
stops being reusable and the Skeleton Crew claim collapses.

## 2. Adding a domain

Adding a third product must require exactly three edits:

1. a new directory `packages/aegis-core/src/packs/<domain>/`,
2. one export line in `packages/aegis-core/src/index.ts`,
3. a new app that renders `<pack>` data through the shared components.

If a new domain needs a change inside `pipeline.ts`, `scoring.ts`, `sse.ts`, `report.ts`, or
`verify.ts`, the abstraction is wrong. Fix the abstraction.

## 3. Types are the contract

- `AuditReport` is the single JSON contract between API, UI, and tests. Changing it is a
  breaking change: update types, normalizers, report builder, UI, and tests in one commit.
- Every field that reaches the UI must be serializable (no `Date`, no class instances, no
  functions). Timestamps are epoch milliseconds; durations are numbers.
- `strict`, `noUncheckedIndexedAccess`, and `noImplicitOverride` stay on. Never add `any`,
  `@ts-ignore`, or non-null assertions to silence a real error.
- Prefer `unknown` at boundaries and narrow explicitly.

## 4. Pipeline invariants

1. Stages run in order, exactly once. No stage may be skipped or re-entered.
2. A stage emits `stage.started`, zero or more `stage.log`, then exactly one
   `stage.completed` — or the run ends with `run.failed`.
3. `report.ready` precedes `run.completed`.
4. Deterministic work happens in code; the model only *proposes*. Every model output passes
   through a normalizer before it can influence a report.
5. The verifier must be able to fail. A verifier that always passes is a bug.

## 5. Scoring rules

- Severity is derived from score by `severityFromScore`. Never hand-assign severity.
- The run-level score is computed by `aggregateRisk` from findings. Never take the model's
  self-assessment as the headline number.
- Scores are integers in `[0, 100]`. Clamp at the boundary, not at the render site.
- Findings are sorted by descending score before the report is built.

## 6. Provider rules

- Providers use `fetch` only. No SDKs.
- Every provider call has a timeout and honours the caller's `AbortSignal`.
- Provider errors are passed through `redactSecrets` before leaving the core.
- A provider failure is never fatal: fall back, log a `warn`, and record a verification note.
- The sandbox client must exercise the *same* pipeline and produce the *same* types.

## 7. Security rules

- Secrets come from `process.env` only. Never from a file, never from the client.
- `/api/health` returns provider id, label, mode, and model name — never a key, never a base
  URL that embeds a token.
- All user input is validated for type, emptiness, and length before use.
- No `dangerouslySetInnerHTML`, no `eval`, no `new Function`, no dynamic `require`.
- No `child_process`, no filesystem writes, no outbound request that is not a configured
  model provider.
- Errors shown to the user are actionable sentences; stack traces stay in the server log.

## 8. UI rules

- Both apps share the core's semantic tokens (`SEVERITY_STYLE`, `BAND_LABEL`, `BAND_COLOR`,
  `formatMoney`, `formatDuration`) so severity colours cannot drift between products.
- Each app owns its own visual identity. CodeMedic is a dark cyber console; LexGuard is an
  executive audit desk. Sharing a component is allowed; sharing a *look* is not.
- Every panel has three states: empty, loading, and populated. Empty states explain what will
  appear and which agent produces it.
- Buttons either do something or are not rendered. No dead controls.
- No emoji in the product UI. Icons come from `lucide-react`.

## 9. Code style

- TypeScript, ES modules, 2-space indent, double quotes, semicolons, trailing commas.
- One responsibility per module. Extract on the second repetition, not the first.
- Comments explain *why*. Never narrate the diff, never restate the code.
- No `TODO`, no placeholder strings, no `console.log` left in shipped paths.
- Files stay under ~400 lines; split by responsibility when they grow.
- Public functions get a short doc comment describing inputs, outputs, and failure behaviour.

## 10. Testing rules

- The pipeline must remain testable without network access: inject `llm`, set `pace` to zero.
- Every preset is covered end-to-end in both domains, including a verification assertion.
- Failure paths are tested: empty input, unusable provider output, malformed JSON.
- A test may not be weakened to pass. Fix the code.
- `npm run typecheck && npm test` is the minimum bar before any commit.

## 11. Definition of done

A change is done when:

1. `npm run typecheck` reports zero errors in every workspace,
2. `npm test` passes,
3. `npm run build` succeeds for both apps,
4. both UIs were exercised in a browser with no console errors,
5. the change is reflected in `.kiro/specs/aegis-core/*` if it alters behaviour,
6. no secret, no generated artefact, and no `node_modules` is staged.
