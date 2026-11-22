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
  - debug
  - review
  - audit
  - test
---

# Master Workflow — Mandatory Three-Phase Protocol

Applies to **every** task, in every repository, for every conversation.
Read `MEMORY.md` in the active workspace first, then follow the phases in order.
No phase may be skipped, merged, or declared complete while its gate fails.

## Phase 1 — ARCHITECT (plan before code)

Write the plan before touching a single line of implementation.

Required deliverables:
1. **Scope** — what is in, what is out, and why.
2. **Structure** — files to create/modify, module boundaries, data shapes,
   interfaces/signatures, and dependency choices with justification.
3. **Edge cases** — empty/null input, huge input, unicode, concurrency, repeat
   invocation, partial failure, offline, permission denied, rollback, platform
   path/encoding differences.
4. **Failure modes** — timeout, retry policy, user-visible behavior on failure.
5. **Security model** — trust boundaries, inputs needing validation,
   authorization checks, what is logged and what is never logged.
6. **Verification plan** — exact commands/tests that will prove success.
7. **Task list** — atomic, ordered, each with a completion test.

**Gate:** concrete files and decisions named; no "we'll figure it out later".
For a genuinely trivial change, compress the plan to two sentences — think, but
do not fabricate ceremony.

## Phase 2 — BUILDER (clean, modular, secure, low memory)

- **Clean & modular** — one responsibility per function/module; extract on the
  second repetition; no god-files; no dead code, debug prints, or placeholders.
- **Minimal diff** — change only what the plan requires; no drive-by refactors
  or reformatting of unrelated lines.
- **Secure by default** — validate and sanitize at every trust boundary;
  parameterized queries; confined file paths; least privilege; secrets from
  environment variables only; no `eval`/`exec` on untrusted data; no
  `shell=True` with interpolated input; TLS verification on; no secrets in
  logs, errors, or commits.
- **Low memory (16 GB RAM, no GPU)** — stream instead of buffering; cap loops,
  retries, buffers, and heaps; one heavy process at a time; close browsers and
  workers when done; prefer small dependencies.
- **Honest errors** — actionable message, no stack traces or internal paths
  leaked to end users.

**Gate:** code runs; interfaces match the plan; nothing left stubbed or stubbed
behind a `TODO`.

## Phase 3 — QA & SECURITY AUDITOR (prove it, then fix it)

1. **Automated tests** — run the project's real suite plus tests for the new
   behavior; cover the Phase 1 edge-case matrix; mock only true external
   boundaries and justify it.
2. **Static checks** — repo linters, type checks, formatters. Fix, do not
   suppress.
3. **Security audit** — scan the diff for injected secrets, unsafe subprocess
   construction, path traversal, SSRF, permissive CORS, missing authz,
   unbounded input, insecure deserialization, risky dependencies, and sensitive
   data in logs/errors.
4. **Secret hygiene** — no `.env`, key, token, or data dump staged; `.gitignore`
   covers generated output.
5. **Documentation accuracy** — use the `context7` MCP server for current
   library/API documentation instead of guessing versions or signatures. Never
   invent a flag, config key, or API.
6. **UI verification** — use the browser tools (Playwright MCP when interaction
   is needed) to exercise the real flow: happy path plus at least one failure
   path; check console errors and network failures.
7. **Auto-fix loop** — every failing test, lint error, type error, or security
   finding is fixed and re-run until green. Never weaken a test, loosen a type,
   or disable a rule to reach green.
8. **Evidence** — record the exact commands run and their results, including
   anything that could not be verified and why.

**Gate:** all checks pass, or are explicitly reported as unverifiable with a
reason; no secrets in the diff; report states what changed, how it was verified,
and what remains uncertain.

## Memory rule

**Always read `MEMORY.md` before starting any task and update it after
finishing** — append dated lessons, promote durable rules, keep open questions
honest. Never record secrets or volatile file contents there.

## Reporting format

```
Phase 1: <plan, decisions, edge cases>
Phase 2: <files changed, why>
Phase 3: <commands, results, security findings, fixes>
Residual risk: <unverified/unknown, or "none identified">
```

## Automatic failure

- Writing code before the plan exists.
- Claiming tests are "not needed" for behavior that has tests elsewhere.
- Fixing a failing check by deleting or loosening it.
- Reporting done while a command still errors.
- Committing a credential.
- Inventing an API, flag, or config key that was never verified.
