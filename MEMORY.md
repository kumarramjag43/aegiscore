# MEMORY.md — Persistent Project Memory

> **Rule: always read `MEMORY.md` before starting any task and update it after finishing.**

**Read this file before starting any task. Update it after finishing.**

This is the durable memory of this workspace. It survives conversations and
outranks general defaults. If a rule here conflicts with a habit, this file wins.

---

## 1. How to use this file

**At the start of every task**
1. Read this file in full.
2. Apply every rule in §2 and §3 without being asked.
3. Check §5 (Open Questions) before relying on an assumption it lists.

**At the end of every task**
1. Append a dated entry to §4 (Lessons Learned) if you discovered something
   non-obvious: a broken assumption, a gotcha, a command that lies, a version
   quirk, a perf trap.
2. Add a new rule to §2 only if the lesson must bind *future* work, and keep it
   testable ("always X", "never Y") rather than vague advice.
3. Move anything you resolved out of §5; add anything you could not verify.
4. Keep it short. Delete stale entries instead of layering contradictions.
   Never record secrets, tokens, customer data, or file contents that change.

---

## 2. Project Rules (binding)

1. **Three phases, every task**: Architect → Builder → QA & Security Auditor.
   Full protocol: `.openhands/microagents/master_workflow.md`. No code before a
   written plan; no "done" while a check fails.
2. **Verify, don't assume.** Never invent a flag, config key, or API signature.
   Check the repo, `--help`, or Context7 docs first, then write it down here.
3. **Read-only until proven otherwise.** Inspect before editing. Prefer the
   smallest diff that satisfies the request.
4. **No secrets in code, config, logs, or commits.** Environment variables only.
   Never print a credential; never widen its exposure to make a test pass.
5. **No destructive commands** (`rm -rf` outside `/tmp`, force-push, dropping
   data, rewriting history) without explicit user confirmation.
6. **Tests are evidence.** Run them; report exact commands and results. Never
   weaken a test, type, or lint rule to reach green.
7. **Resource discipline (16 GB RAM, no GPU).** One heavy process at a time;
   cap heaps; close browsers when done; no unbounded loops or buffering.
8. **Clean up after yourself.** Remove scratch files and background servers you
   started; leave the tree as you found it plus the intended change.

---

## 3. Environment Facts (verified)

| Fact | Value |
| --- | --- |
| Host RAM | 16 GB total (`MemTotal: 16374228 kB`), no GPU |
| OpenHands agent-server | `1.63.1`, local, `http://127.0.0.1:60000` |
| Node / npm | `v24.22.2` / `12.2.2` |
| Browser | system Chromium at `/usr/bin/chromium` (`CHROME_BIN`, `PUPPETEER_EXECUTABLE_PATH` set) |
| Python | 3.13, `python3` on PATH |
| Workspace | `/workspace/project` (git repo, initially empty) |
| MCP config | `.openhands/mcp.json` — canonical, schema-validated |

**Active MCP servers** (all four are in use in this workspace)

| Server | How it is provided | Status | Purpose / notes |
| --- | --- | --- | --- |
| `context7` | `.openhands/mcp.json` → `@upstash/context7-mcp@4.7.3`, stdio, ~103 MB | Configured + handshake-verified; tools appear after the conversation is started with this config | Current library/API docs. Tools: `resolve-library-id`, `query-docs`. `resolve-library-id` requires **both** `libraryName` and `query` |
| `tavily` | Client-provided MCP, active in-session | Active | Web search/extract/crawl/map/research (`default_tavily_*` tools). Use for current facts beyond the model cutoff |
| `rea` | Client-provided MCP, active in-session | Active | Reverse-engineering / binary analysis toolset (200+ `rea_*` tools: native analysis, artifacts, web, Android). Heavy — run one deep analysis at a time |
| `playwright` | `.openhands/mcp.json` → `@playwright/mcp@0.0.86`, stdio, system Chromium | Configured + handshake-verified; tools appear after the conversation is started with this config | Browser UI testing, 25 tools. ~102 MB idle, **~1.05 GB while a page is open**. `browser_click` needs `element` + `target` (not `ref`) |

Known gotchas:
- Playwright MCP blocks `file://` URLs. Serve local files over HTTP
  (`python3 -m http.server`) instead.
- `--image-responses omit` is intentional: screenshots would flood context and
  raise memory use. Flip to `allow` only for a specific visual check.
- `context7` and `playwright` are stdio servers started per conversation; there
  is **no** on-disk MCP settings file in this deployment — settings are
  persisted server-side per client settings key.
- `tavily` and `rea` are supplied by the client, not by `.openhands/mcp.json`.
  Do not assume they are available on a different machine until verified.

---

## 4. Lessons Learned (newest first)

### 2026-11-22 — Durable configuration layers
- The protocol is installed in **three** places on purpose:
  `AGENTS.md` (loaded by this client every conversation), the project
  microagent (`.openhands/microagents/master_workflow.md`), and the global
  copies at `~/.openhands/microagents/master_workflow.md` +
  `~/.openhands/skills/master-workflow/SKILL.md` (skill frontmatter matches the
  format of the installed public skills: `name` / `description` / `triggers`).
- Editing one copy without the others causes drift. After any protocol change,
  copy the body to all three and re-diff them.
- `~/.openhands/` is per-user and outside git: it is not captured by commits in
  this repo, so it must be recreated on a new machine.

### 2026-11-22 — Bootstrap session
- This agent-server build (1.63.1) has **no microagent loader** in the server
  bundle (verified by scanning it for `microagent`/`.openhands/microagents`).
  Repo context is loaded from `AGENTS.md`; skills load from
  `~/.openhands/skills/`. The microagent files are kept as the standard
  OpenHands location so the protocol travels with the repo and works on other
  clients/versions, but do not assume they are injected here.
- MCP servers are not read from a file at conversation start by this runtime.
  `.openhands/mcp.json` is the version-controlled source of truth; servers must
  be added through the client (Settings → MCP) or the authenticated API
  (`POST /api/settings/mcp/{key}`, `POST /api/conversations/{id}/mcp`,
  `POST /api/mcp/test`).
- `npx -y pkg@version` reuses `~/.npm/_npx`; pre-warming removed the cold-start
  download and keeps conversation start fast.
- Chromium's `--no-sandbox` is required in this container; Playwright MCP exposes
  it as `--no-sandbox`.
- Validate any MCP config change before applying it: fetch
  `http://127.0.0.1:60000/openapi.json` and validate each entry against
  `components.schemas.MCPServer` (`additionalProperties: false`, so unknown keys
  like a Claude-style `type` field are rejected). Then prove the server with a
  real `initialize` → `tools/list` → tool-call handshake.
- Killing Playwright MCP leaves `[chromium] <defunct>` zombies under init; they
  hold no RSS and are reaped on their own. Not a leak.
- Do not assume `ref` naming in Playwright MCP calls: `browser_click` takes
  `element` (human label) plus `target` (snapshot ref).

---

## 5. Open Questions / Unverified

- Does the OpenHands Cloud UI import `.openhands/mcp.json` directly, or must
  servers be re-entered per settings key? Unverified — no authenticated client
  available from inside the sandbox.
- Playwright's ~1 GB peak is measured with one tab and a static page; heavy SPAs
  will be higher. Re-measure before claiming a number for a real app.
