# AegisCore

**One skeleton. Two products. Zero duplicated agent logic.**

AegisCore is a modular, reusable multi-agent audit engine. It reads an artefact, finds what
can hurt you, scores it, rewrites it, and then *proves the rewrite is safe* — and it does that
for two completely different domains without knowing anything about either one.

| | |
| --- | --- |
| 🩺 **CodeMedic AI** | Autonomous code & API security auditor and auto-patcher |
| ⚖️ **LexGuard AI** | Contract, invoice & financial fraud detector and counter-drafter |

Both applications are powered by the **same** package: `packages/aegis-core`. Neither app
contains a prompt, a detector, or a pipeline stage. Delete one app and the other still works.

![status](https://img.shields.io/badge/build-passing-34d399)
![types](https://img.shields.io/badge/typecheck-0%20errors-22d3ee)
![tests](https://img.shields.io/badge/tests-25%20passing-a78bfa)
![providers](https://img.shields.io/badge/providers-OpenAI%20%C2%B7%20Groq%20%C2%B7%20Gemini%20%C2%B7%20Claude-fbbf24)
![mode](https://img.shields.io/badge/sandbox-no%20API%20key%20required-94a3b8)
![license](https://img.shields.io/badge/license-MIT-64748b)

---

## Why this wins "Skeleton Crew"

The category asks for a reusable core that can power more than one product. AegisCore takes
the harder route: the reusable part is not a UI kit or a prompt library — it is the *audit
workflow itself*.

```
        ┌──────────────────────────────────────────────┐
        │            packages/aegis-core               │
        │  scanner → critic → healer → verifier        │
        │  scoring · verification · diff · SSE · report│
        └───────────────┬──────────────┬───────────────┘
                        │              │
          ┌─────────────▼───┐      ┌───▼──────────────┐
          │  code-security  │      │  contract-fraud  │   ← domain packs
          │  (detectors,    │      │  (signals,       │     (data, not code)
          │   prompts,      │      │   prompts,       │
          │   presets)      │      │   presets)       │
          └─────────────┬───┘      └───┬──────────────┘
                        │              │
          ┌─────────────▼───┐      ┌───▼──────────────┐
          │  CodeMedic AI   │      │   LexGuard AI    │   ← products
          │  :3001          │      │   :3002          │
          └─────────────────┘      └──────────────────┘
```

The same four stages audit a JavaScript route **and** a predatory vendor contract. The same
SSE stream drives a dark DevSecOps terminal **and** an executive legal timeline. The same
scoring model ranks a SQL injection **and** an uncapped indemnity.

---

## Quickstart

```bash
git clone <this-repo>
cd aegiscore
npm install
npm run dev
```

Open **http://localhost:3001** (CodeMedic AI) and **http://localhost:3002** (LexGuard AI).

That is it. **No API key, no database, no Docker, no Python.** With no keys present both apps
run in **Interactive Demo Sandbox Mode**: the real pipeline executes, driven by deterministic
domain analyzers instead of a remote model. Every finding, patch, score, and verification
check you see is computed by the same code that runs in production mode.

### Use a real model (optional)

```bash
cp .env.example .env
# put ONE key in .env — the first configured provider wins
echo 'GEMINI_API_KEY=...' >> .env
npm run dev
```

Supported out of the box, all via plain `fetch` (no SDKs):

| Provider | Key | Default model |
| --- | --- | --- |
| OpenAI | `OPENAI_API_KEY` | `gpt-4o-mini` |
| Groq | `GROQ_API_KEY` | `llama-3.3-70b-versatile` |
| Google Gemini | `GEMINI_API_KEY` | `gemini-2.0-flash` |
| Anthropic | `ANTHROPIC_API_KEY` | `claude-sonnet-4-20250514` |
| Sandbox | — | deterministic analyzers |

Force one with `AEGIS_PROVIDER=gemini` (or `demo` to always use the sandbox). The header badge
in both apps always tells you which provider is live.

---

## The four agents

| # | Agent | Responsibility | Output |
| --- | --- | --- | --- |
| 1 | **Scanner** | Chunks the artefact with exact line/clause anchors and structural counts | `ScanResult` |
| 2 | **Risk Critic** | Finds flaws, scores each 0–100, cites the exact line or clause | `CritiqueResult` |
| 3 | **Auto-Healer** | Rewrites the artefact — bound parameters, atomic updates, redlined clauses | `HealResult` |
| 4 | **Verifier** | Re-runs the detectors on the fix, checks domain invariants, signs the report | `Verification` |

The Verifier is deliberately **not** a model call. It is deterministic code that is allowed to
fail, which is the only reason "verified" means anything.

```
event: stage.log
data: {"type":"stage.log","stage":"critic","level":"warn",
       "message":"CRITICAL · SQL injection through string concatenation @ Line 9",
       "at":1795496622173}
```

Both UIs consume that stream and paint it live: agent rail, per-stage logs, durations, then
the findings, the diff or heatmap, and the signed report.

---

## What each product does

### 🩺 CodeMedic AI — `apps/codemedic-ai` · port 3001

Dark DevSecOps console.

- Paste a route, module, or API snippet — or click one of three real presets:
  **SQL Injection API**, **Exposed Key + Auth Bypass**, **Async Race Condition**.
- Watch Scanner → Critic → Healer → Verifier work line by line.
- **Findings**: severity, score, exact line, the offending code, why it is exploitable, the fix.
- **Diff**: original vs patched, side by side, with `+ / ~ / -` markers.
- **Copy patched code**, download the **Markdown** or **JSON** audit report.
- Risk gauge with derived severity counters and a signed verification list.

Real output from the SQL injection preset:

```diff
- const result = await pool.query("SELECT id, email, role FROM users WHERE email = '" + email + "' LIMIT 50");
+ const result = await pool.query(`SELECT id, email, role FROM users WHERE email = $1 LIMIT 50`, [email]);
```

### ⚖️ LexGuard AI — `apps/lexguard-ai` · port 3002

Executive legal & finance audit desk — a deliberately different visual language from CodeMedic.

- Paste a contract, invoice, or credit agreement — or click one of three presets:
  **Predatory Vendor Contract**, **Inflated Tax Invoice**, **Hidden Loan Traps**.
- **Live audit**: a vertical agent timeline with durations and per-agent reasoning.
- **Risk heatmap**: severity-tinted cards, the quoted red-flag clause, and the counter-position.
- **Financial exposure**: quantified range in the document's currency with a stated basis
  (e.g. `$250,000 – $625,000` for the loan preset).
- **Counter-draft**: a complete, exportable *Counter-Proposal and Audit Notice* — reservation of
  rights, clause-by-clause redlines, protective terms, and next steps, rendered on paper.

The invoice preset is reconciled arithmetically, not described:

```
Subtotal:   $39,250.00
VAT (19%):   $8,925.00   →   $7,457.50
Total due:  $52,175.00   →  $46,707.50
```

---

## Architecture

```mermaid
flowchart LR
  subgraph browser
    U1["CodeMedic UI"]
    U2["LexGuard UI"]
  end
  subgraph next["Next.js route handlers"]
    R1["POST /api/audit · SSE"]
    R2["GET /api/health"]
  end
  subgraph core["@aegiscore/core"]
    PL["pipeline"]
    PR["providers"]
    VF["verify + scoring"]
    RP["report + diff + sse"]
  end
  subgraph packs["domain packs"]
    CS["code-security"]
    CF["contract-fraud"]
  end
  LLM["OpenAI · Groq · Gemini · Claude"]

  U1 --> R1 --> PL
  U2 --> R1
  U1 --> R2
  U2 --> R2
  PL --> CS
  PL --> CF
  PL --> PR --> LLM
  PL --> VF
  PL --> RP
```

### Repository layout

```
aegiscore/
├── packages/aegis-core/            # THE SKELETON
│   ├── src/
│   │   ├── pipeline.ts             # 4-stage orchestrator + SSE event generator
│   │   ├── types.ts                # DomainPack, AuditReport, AgentEvent …
│   │   ├── scoring.ts              # severity, bands, compounding risk
│   │   ├── verify.ts               # invariant evaluation + confidence
│   │   ├── diff.ts                 # LCS line diff + unified hunks
│   │   ├── sse.ts                  # encode / stream / consume
│   │   ├── report.ts               # Markdown report builder
│   │   ├── security.ts             # input clamping, secret redaction
│   │   ├── normalize.ts            # untrusted model output → typed results
│   │   ├── providers/              # openai · groq · gemini · anthropic · sandbox
│   │   └── packs/
│   │       ├── code-security/      # detectors, repairs, prompts, 3 presets
│   │       └── contract-fraud/     # signals, clause parser, counter-draft, 3 presets
│   └── test/pipeline.test.ts       # 25 tests, no network
├── apps/codemedic-ai/              # :3001
├── apps/lexguard-ai/               # :3002
├── .kiro/                          # specs, steering, agent hook
└── .env.example
```

### Adding a third domain

```ts
// packages/aegis-core/src/packs/my-domain/index.ts
export const myDomainPack: DomainPack = {
  id: "my-domain",
  label: "My Domain",
  documentNoun: "artefact",
  actionLabel: "Run audit",
  agents: { scanner: {...}, critic: {...}, healer: {...}, verifier: {...} },
  presets: [...],
  prompts: { scanner: (ctx) => [...], critic: ..., healer: ..., verifier: ... },
  sandbox: { scan, heal },
  detect,
  verify,
};
```

One new directory, one export line. No changes to `pipeline.ts`, `scoring.ts`, `verify.ts`,
`report.ts`, or `sse.ts`.

---

## Verification

```bash
npm run typecheck   # 0 errors — core + both apps
npm test            # 25/25 passing
npm run build       # both Next.js apps compile and prerender
```

The test suite exercises the real pipeline with `pace: 0` and an injectable provider:

- every preset in both domains produces findings, patches, a changed document, and
  `verification.passed === true`;
- the SQL injection preset is parameterised, the secret preset is moved to `process.env` and
  re-signed, the race condition becomes an atomic conditional update;
- the invoice preset is reconciled and the counter-document contains every redline;
- a provider that returns prose triggers the deterministic fallback and still yields a report;
- SSE frames are emitted in order and every `data:` payload parses as JSON.

---

## Kiro artifacts

| Path | Contents |
| --- | --- |
| `.kiro/specs/aegis-core/requirements.md` | 17 EARS requirements with acceptance criteria |
| `.kiro/specs/aegis-core/design.md` | Architecture, Mermaid data flow, scoring, verification, failure modes, trade-offs |
| `.kiro/specs/aegis-core/tasks.md` | Completed implementation checklist |
| `.kiro/steering/architecture-rules.md` | The Skeleton Crew rules that keep one core reusable |
| `.kiro/hooks/auto-audit-on-save.json` | Agent hook: re-run `npm run audit:quick` on save |

---

## Security posture

- Inputs are validated for type, emptiness, and length (`AEGIS_MAX_INPUT_CHARS`, default
  200 000) before any model call.
- Keys live in `process.env` only. `/api/health` exposes provider *identity*, never credentials.
- Provider errors pass through `redactSecrets` before reaching the UI, so an upstream error
  cannot echo a key back to the browser.
- User content is fenced as data in every prompt; domain rules live in the system prompt.
- The UI never uses `dangerouslySetInnerHTML`; code and documents render as text.
- No persistence, no filesystem writes, no `child_process`, no telemetry.

## Honest limitations

- Detectors are rule-based and deliberately explainable; they are not a substitute for a
  semantic scanner or a lawyer. The report says so, in the report.
- Runs are request-scoped: there is no history, no database, no auth.
- Streaming is stage-level, not token-level.

---

## License

MIT — see [LICENSE](./LICENSE).

Built for the **Kiroween 2026** hackathon: *Skeleton Crew* and *Best Demo*.
