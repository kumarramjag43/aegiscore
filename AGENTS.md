# AGENTS.md

Operational contract for this workspace. Applies to every conversation.
Full protocol: `.openhands/microagents/master_workflow.md` (also installed
globally at `~/.openhands/microagents/master_workflow.md`).

## 0. Session start — mandatory

1. Read `MEMORY.md` (workspace root) in full. It holds binding rules, verified
   environment facts, active MCP servers, and past lessons.
2. Read `.openhands/microagents/master_workflow.md`.
3. Work through the three phases below, in order, without skipping.

## The Three-Phase Protocol (strict)

### Phase 1 — ARCHITECT
Plan the structure, files, and edge cases **before writing any code**.
- Scope: what is in, what is out, why.
- Structure: files to create/modify, module boundaries, interfaces, data shapes,
  dependencies (justified).
- Edge cases: empty/null, huge input, unicode, concurrency, repeat invocation,
  partial failure, offline, permission denied, rollback, platform differences.
- Failure modes: timeout, retry, user-visible behavior.
- Security model: trust boundaries, validation, authorization, what is never logged.
- Verification plan: the exact commands that will prove success.

**Gate:** concrete decisions, no "figure it out later". Trivial changes get a
two-sentence plan — think, but do not fabricate ceremony.

### Phase 2 — BUILDER
Write clean, modular, secure code with **low memory usage (16 GB RAM limit,
no GPU)**.
- Clean: one responsibility per unit, no duplication, no dead code or debug output.
- Modular: small composable functions; extract on the second repetition.
- Secure: validate/sanitize at every boundary; parameterized queries; confined
  paths; least privilege; secrets from env only; no `eval`/`exec` on untrusted
  data; no `shell=True` with interpolated input.
- Low memory: stream instead of buffering; cap loops, retries, buffers, heaps;
  one heavy process at a time; close browsers/workers when done.
- Minimal diff: no drive-by refactors, no reformatting of unrelated lines.

**Gate:** runs; matches the plan; nothing stubbed, no `TODO` left behind.

### Phase 3 — QA & SECURITY AUDITOR
Prove it, then auto-fix everything before finishing.
- **Automated tests**: run the real suite plus tests for new behavior; cover the
  Phase 1 edge-case matrix.
- **Static checks**: linters, type checks, formatters — fix, never suppress.
- **Security audit**: scan the diff for secrets/leaks, injection, path traversal,
  SSRF, permissive CORS, missing authorization, unbounded input, unsafe
  deserialization, and sensitive data in logs or errors.
- **Docs**: use the `context7` MCP server for current library/API documentation.
  Never invent a flag, config key, or signature.
- **UI testing**: use the browser tools (Playwright MCP for interaction) on the
  real flow — happy path plus a failure path; check console and network errors.
- **Auto-fix loop**: every failure is fixed and re-run until green. Never weaken
  a test, type, or lint rule to reach green.

**Gate:** all checks pass or are explicitly reported as unverifiable with a
reason; no secrets in the diff; evidence (commands + results) in the report.

## Hard rules

- Verify before asserting: no invented flags, config keys, or API signatures.
- No secrets in code, config, logs, commits, or error messages — env vars only.
- No destructive commands (force-push, history rewrite, deleting data outside
  `/tmp`) without explicit confirmation.
- Never weaken a test, type, or lint rule to reach green.
- Clean up scratch files and background servers you started.

## MCP servers

Configured in `.openhands/mcp.json`: `context7` (docs) and `playwright` (UI).
Active in-session MCP tools also include `tavily` (web research) and `rea`
(reverse-engineering analysis). Current inventory and status live in
`MEMORY.md` §3 — trust that table over this summary if they disagree.

## Session end — mandatory

Update `MEMORY.md`: append dated lessons under §4, promote durable rules into
§2, keep §5 (Open Questions) honest. Then report:

```
Phase 1 / Phase 2 / Phase 3 / Residual risk
```
