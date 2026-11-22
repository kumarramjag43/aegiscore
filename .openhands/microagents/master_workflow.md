---
name: master_workflow
type: repo
agent: CodeActAgent
triggers:
  - workflow
  - plan
  - implement
  - refactor
  - fix
  - review
  - audit
  - test
---

# Master Workflow — Mandatory Three-Phase Protocol

This protocol applies to **every** task in this workspace: features, bug fixes,
refactors, scripts, config changes, and documentation that touches behavior.
It is not optional and it is not a summary. Each phase has a hard exit gate; a
phase may not be skipped, merged with another, or declared "done" while its gate
fails.

Non-negotiables that apply across all phases:

- **Read `MEMORY.md` first** (workspace root) and follow every rule recorded
  there. It outranks your defaults; it is the project's accumulated law.
- **Never invent facts** about an API, library version, or config key. If it is
  not in `MEMORY.md`, the repo, or a verified doc lookup (context7 MCP), say so
  and check before writing code.
- **Budget-aware**: assume a 16 GB machine with no GPU. Prefer small
  dependencies, bounded memory, and one heavy process at a time.
- **Secrets**: never print, commit, or paste credentials. Reference environment
  variables only. Never widen a secret's blast radius to make a test pass.

---

## Phase 1 — ARCHITECT (plan before touching code)

Goal: eliminate ambiguity and surprise before a single line is written.

Required outputs, written down before implementation starts:

1. **Scope statement** — what is in, what is explicitly out, and why.
2. **Structure plan** — files to create/modify, module boundaries, data shapes,
   interfaces/signatures, and dependency choices with justification.
3. **Edge-case matrix** — empty input, nulls, huge input, unicode, concurrent
   access, repeated invocation, partial failure, offline, permission denied,
   rollback, and the platform-specific path/encoding cases that apply.
4. **Failure mode review** — for each new external call: timeout, retry policy,
   what happens when it fails, and what the user sees.
5. **Security model** — trust boundaries, inputs requiring validation,
   authorization checks, what data is logged, and what is never logged.
6. **Verification plan** — the exact commands/tests that will prove success,
   plus how a reviewer could reproduce them.
7. **Task list** — atomic, ordered, each with a completion test.

Gate to leave Phase 1: the plan exists in written form, names concrete files and
functions, and every "we will figure it out later" has been converted into a
decision or an explicit open question. For a genuinely trivial change (a typo, a
one-line config value), compress the plan to two sentences — do not fabricate
ceremony, but do not skip thinking.

---

## Phase 2 — BUILDER (small, clean, secure increments)

Goal: correct code with the smallest viable surface area.

Rules:

- **Modular**: one responsibility per function/module; no god-files; no copy-paste
  duplication. Extract on the second repetition, not the fifth.
- **Minimal diff**: change only what the plan requires. No drive-by refactors, no
  reformatting unrelated lines, no speculative abstractions.
- **Secure by default**: validate and sanitize at every trust boundary; use
  parameterized queries; resolve and confine file paths; least privilege;
  secrets from env only; no `shell=True` with interpolated input; no `eval`/
  `exec` on untrusted data; safe deserialization; TLS verification stays on.
- **Bounded resources**: stream instead of slurping; cap loops, retries, and
  buffers; close what you open; no unbounded concurrency.
- **Honest errors**: actionable messages, no stack traces or internal paths
  leaked to end users, no secrets in exceptions or logs.
- **Comments**: only for non-obvious invariants or deliberate trade-offs. Never
  restate the code, never narrate the diff.
- **Increments**: implement in the order of the task list, keeping the tree
  runnable after each step.

Gate to leave Phase 2: the code runs, the plan's interfaces exist as specified,
and there are no placeholders, `TODO` stubs, dead branches, or debug prints left
behind.

---

## Phase 3 — QA & SECURITY AUDITOR (prove it, then fix it)

Goal: nothing ships on trust. This phase has veto power.

Required checks:

1. **Automated tests** — run the project's real test suite plus new tests for the
   behavior you added. Test real code paths; mock only where a boundary is truly
   external, and justify it. Cover the Phase 1 edge-case matrix.
2. **Static checks** — linters, type checks, and formatters that the repo already
   uses. Fix findings, do not suppress them silently.
3. **Security audit** — scan the diff for: injected secrets/credentials, unsafe
   subprocess or shell construction, path traversal, SSRF, permissive CORS,
   missing authz on new endpoints, unbounded input, insecure deserialization,
   dependency risk, and sensitive data in logs/errors.
4. **Secret and artifact hygiene** — confirm no `.env`, key, token, or dump is
   staged; confirm `.gitignore` covers generated output.
5. **Behavioral verification** — for UI or integration work, exercise the flow
   (Playwright MCP for browser flows) and confirm the happy path plus at least
   one failure path.
6. **Auto-fix loop** — every failing test, lint error, type error, or security
   finding is fixed and re-run until green. Do not report success while a check
   fails. Do not weaken a test, loosen a type, or disable a rule to get green.
7. **Evidence** — record the exact commands run and their results in the final
   report, including anything that could not be verified and why.

Gate to finish the task: all checks pass or are explicitly reported as
unverifiable with the reason; the diff contains no secrets; and the report states
what was changed, how it was verified, and what remains uncertain.

---

## Reporting Format

End every task with:

```
Phase 1: <plan, key decisions, edge cases considered>
Phase 2: <files changed, why>
Phase 3: <commands run, results, security findings, fixes applied>
Residual risk: <what is unverified or unknown, or "none identified">
```

Then append durable lessons and new project rules to `MEMORY.md`.

## Anti-patterns (automatic failure)

- Writing code before the plan exists.
- Declaring tests "not needed" for behavior that has tests elsewhere.
- Fixing a failing check by deleting or loosening the check.
- Reporting done while a command still errors.
- Committing anything containing a credential.
- Inventing a config key, flag, or API signature that was never verified.
