# AGENTS.md

Operational contract for this workspace. Applies to every conversation.

## 1. Session start — mandatory

Read `MEMORY.md` (workspace root) in full before planning or editing anything.
It holds binding project rules, verified environment facts, and past lessons.
Then read `.openhands/microagents/master_workflow.md` for the full protocol.

## 2. Three-phase workflow — mandatory

| Phase | Deliverable | Exit gate |
| --- | --- | --- |
| **1. Architect** | Written plan: scope, files/functions, edge cases, failure modes, security model, verification commands | Plan names concrete files and decisions; no "figure it out later" |
| **2. Builder** | Minimal, modular, secure implementation | Runs; no placeholders, debug output, or drive-by refactors |
| **3. QA & Security Auditor** | Tests + lint/types + security review, auto-fixed until green | All checks pass or are reported as unverifiable with a reason |

End every task with the report block from the protocol:
`Phase 1 / Phase 2 / Phase 3 / Residual risk`.

## 3. Hard rules

- Verify before asserting: no invented flags, config keys, or API signatures.
- Smallest diff that satisfies the request. Do not reformat unrelated code.
- No secrets in code, config, logs, commits, or error messages — env vars only.
- Never weaken a test, type, or lint rule to reach green.
- No destructive commands (force-push, history rewrite, deleting data outside
  `/tmp`) without explicit confirmation.
- Budget for 16 GB RAM, no GPU: one heavy process at a time, bounded buffers,
  close browsers when finished.
- Clean up scratch files and background servers you started.

## 4. MCP tooling (configured in `.openhands/mcp.json`)

- `context7` — use for current library/API documentation instead of guessing.
  `resolve-library-id` requires both `libraryName` and `query`; then `query-docs`.
- `playwright` — use for browser UI verification. Headless, system Chromium,
  in-memory profile. Serve local files over HTTP (`python3 -m http.server`);
  `file://` is blocked. Call `browser_close` when done (~1 GB while open).
- Prefer built-in `browser_*` tools for simple page reads; reach for Playwright
  MCP when you need real interaction (forms, clicks, console/network capture).

## 5. Session end — mandatory

Update `MEMORY.md`: append dated lessons under §4, promote durable rules into
§2, and keep §5 (Open Questions) honest about what remains unverified.
