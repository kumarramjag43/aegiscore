# Devpost submission package — copy, paste, ship

Everything below is written to be pasted into the Kiroween 2026 Devpost form as-is.

- Repository: https://github.com/kumarramjag43/aegiscore
- Live portal: https://aegiscore-portal.vercel.app
- Live CodeMedic: https://aegiscore-codemedic.vercel.app
- Live LexGuard: https://aegiscore-lexguard.vercel.app

All three are deployed and verified: portal `200`, both products `/api/health` `ok`, and a full
four-agent audit runs end-to-end in ~2.5 s (CodeMedic: risk 100, 3 critical findings, 3 patches,
verifier passed @92; LexGuard: risk 100, 5 findings, 4 patches, verifier passed @92).

---

## 1. Title & tagline

**Project title:** `AegisCore`

**Tagline (57 chars):**
`One multi-agent core. Two production apps. Zero rewrites.`

Alternates, all under 60 characters:

| Tagline | Chars |
| --- | --- |
| `One skeleton, two products, zero duplicated agent code` | 54 |
| `Audit anything: code, contracts, invoices — one core` | 52 |
| `Four agents. One core. Two products that actually ship` | 54 |

**Elevator pitch (200 chars, for the card):**
> AegisCore is one reusable four-agent audit pipeline — scan, critique, heal, verify — that powers
> two completely different products: a code security patcher and a contract fraud detector.

---

## 2. The story

### Inspiration

Every "multi-agent" demo I saw during hackathon season had the same shape: a beautiful prompt
chain welded to one product. The moment the domain changed, the agents changed, the prompts
changed, the report format changed — nothing was reusable. Meanwhile "Skeleton Crew" was asking
for exactly the opposite: a core so genuinely reusable that two products could stand on it.

So the question became: **what is the smallest thing that is actually reusable?** Not a prompt
library and not a UI kit. It is the *audit workflow itself* — find problems, score them, fix them,
prove the fix. That workflow is domain-agnostic. Code review and contract review are the same
shape: read an artefact, cite the exact line or clause, propose a safe replacement, verify the
replacement against the same detectors that found the problem.

The second inspiration was judge friction. A security demo that needs an API key, a database and
a seed script is a demo that half the judges will never see. AegisCore had to run the *real*
pipeline with **zero configuration** — so the deterministic analyzers do the reasoning when no
model is available, and the same interface upgrades to a live model the moment a key appears.

### What it does

AegisCore runs a four-agent pipeline over any artefact, streaming every step to the browser over
SSE:

1. **Scanner** — chunks the input, keeping exact line numbers (code) or clause anchors (contracts).
2. **Risk & Anomaly Critic** — detects flaws with domain analyzers, scores each 0–100, computes the
   artefact-level risk, and cites the exact evidence it used.
3. **Auto-Healer** — generates an exact replacement: patched code for a vulnerability, a legally
   safer clause for a predatory term.
4. **Verifier** — re-runs *the same detectors* against the healed output and reports pass/fail per
   check, so "fixed" is a measured claim, not a vibe.

Two products sit on that one pipeline:

**CodeMedic AI** (port 3001, dark DevSecOps console) audits code and API handlers. Three one-click
vulnerable presets: SQL injection in an Express route, a leaked Stripe key with an auth bypass, and
an async double-spend race condition. You get a live multi-agent terminal, a side-by-side diff of
buggy vs. patched code, "Copy", "Download fixed file" (keeps your filename), and a markdown/JSON
audit report.

**LexGuard AI** (port 3002, executive paper-desk UI) audits contracts and invoices. Three presets: a
predatory vendor MSA, an inflated tax invoice, and a hidden loan trap. You get a red-flag heatmap
with severity bands, a quantified financial-exposure estimate (for example **$52,175–$130,438** on
the invoice preset), a clause-by-clause counter-proposal, an audit notice, and a print-clean A4 PDF
for counsel.

**The AegisCore Portal** (port 3000) proves the claim in one screen: the core, the two domain packs,
the two products, live engine status probed from each app's `/api/health`, and a path-isolating
architecture map.

### How we built it

- **Monorepo, npm workspaces** — `packages/aegis-core`, `apps/portal`, `apps/codemedic-ai`,
  `apps/lexguard-ai`. One lockfile, one `npm install`, one `npm run dev`.
- **One domain contract** — `DomainPack` (presets, agent descriptors, prompts, deterministic
  analyzers, healers, verifiers). The core never branches on domain: it walks a registry map. 14
  code detectors and 13 legal/financial signals are just two entries in that map.
- **TypeScript core, Next.js App Router everywhere** — route handlers stream SSE; the same
  `AuditReport` type drives the terminal, the diff, the heatmap and the PDF.
- **Verification as an oracle** — the sandbox analyzers that detect a flaw also verify the heal, so
  demo output is computed, never hand-written.
- **Provider-agnostic LLM layer** — OpenAI, Gemini, Groq or Anthropic via env, with a deterministic
  sandbox fallback that requires no key. `DEMO_MODE=true` pins the sandbox even when keys exist.
- **Kiro-native workflow** — `.kiro/specs/aegis-core` holds EARS requirements, a Mermaid design doc,
  a completed task list, a 64-row edge-case matrix and a validation log; `.kiro/steering` holds the
  modularity rules that keep the core domain-agnostic; two hooks automate audits on save and
  pre-commit.
- **Ship-ready** — `vercel.json` per app, a Render blueprint for all three services, `/api/health`
  on each app, security headers, `no-store` on audit routes, and one deploy script.

### Challenges we ran into

- **Making the core truly domain-blind.** The first version leaked code-specific fields
  (`lineNumber`) into the shared report type. Refactoring to a domain-neutral *anchor* (`file:line`
  or *clause 4.2*) is what finally let LexGuard render the same model as CodeMedic.
- **Deterministic analyzers that are not fake.** Writing regex-based detectors that catch a real SQL
  injection *and* still pass on the healed query took several rounds. The lesson: the healer and the
  detector must share the same evidence model, or the verifier will happily pass a bad patch.
- **Clause parsing that survives invoices.** Invoice line items look exactly like numbered
  headings. Rejecting headings that contain `=` or `qty N x` stopped the whole invoice collapsing
  into one "clause 3".
- **Streaming without leaking.** SSE must flush per step, but the UI must never render a half-built
  report. Structured events (`agent`, `delta`, `report`, `done`) with a final immutable snapshot
  solved it.
- **Print fidelity.** Getting an A4 executive PDF out of a dashboard meant rendering a second,
  report-driven DOM tree with `print:block` and hiding the chrome — a screenshot would have produced
  a PDF with nothing below the fold.
- **GitHub push protection.** Our exposed-secret demo preset contained a Stripe-shaped fake key, and
  GitHub's scanner blocked the push. We replaced it with a synthetic placeholder that still trips our
  own detector but cannot be mistaken for a live credential.
- **Judge-proof deployment.** No key, no database, no seed step — the sandbox path had to be as
  convincing as the live one, because it is what most people will actually see.

### Accomplishments that we're proud of

- **Skeleton Crew, literally:** two production web apps, one 4-agent core, **zero duplicated agent
  logic** — no prompt, detector or pipeline stage lives in an app. Delete either app and the other
  still builds and runs.
- **A verifier that means something:** fixes are re-scanned by the same detectors that found the
  bugs, and the report shows each check individually (14/14 on the invoice preset, per-check pass on code).
- **Quantified, not vibes:** a $52,175–$130,438 exposure range on the invoice preset, a 0–100 risk
  score with a documented formula, and diff-level line anchors on every finding.
- **Zero-friction demo:** full four-agent audit in ~2.4 s end-to-end (UI streaming pace) and
  ~250 ms of pure compute, from a fresh clone, with no key and no network.
- **Engineering hygiene:** 32 unit tests across 9 suites, four typechecked workspaces, three
  production builds, a 64-row edge-case matrix, and a validation log with the real commands and
  their output.
- **Kiro used as intended:** specs first, then steering rules the code actually obeys, then hooks.

### What we learned

- Reusability is a **data-shape** decision before it is a code decision. The day the report stopped
  knowing what a "line" was, both apps got simpler.
- A verifier is only as good as its independence from the healer — and the cheapest way to get that
  independence is to reuse the detectors, not to write new checks.
- Deterministic fallbacks are not a downgrade; they are the difference between a judge seeing your
  demo in five seconds or never.
- Spec-first pays off in the last hour: the EARS requirements and the edge-case matrix are what
  turned "make it nicer" into a scoped list of ten shippable changes.

### What's next for AegisCore

- **More domain packs** — infrastructure-as-code (Terraform), Kubernetes manifests, privacy policies
  (GDPR/DPA), medical consent forms. Each is one `DomainPack`; the pipeline is untouched.
- **Tighten the loop** — open a PR with the patched file, or send the counter-proposal to the
  counterparty, straight from the report.
- **Team memory** — persist verified fixes and accepted redlines so repeated audits get faster and
  the critic learns the organisation's risk appetite.
- **Evidence-first model use** — keep the deterministic analyzers as the spine and let models draft
  the prose, so nothing in a report is unverifiable.

---

## 3. Demo video script (2:30, exact timestamps)

Record 1440×900, no audio keystrokes, one browser window. Every step runs in **sandbox mode** — no
API key on screen. Numbers below are what the apps actually produce.

| Time | Screen | Action | Voice-over |
| --- | --- | --- | --- |
| 0:00–0:12 | Portal, hero | none | "Two products, completely different industries: code security and contract fraud. Watch the top right — same engine badge on both. One core. Zero duplicated agent code." |
| 0:12–0:30 | Portal, architecture map | Hover `code-security`, then `contract-fraud` | "The skeleton is a four-agent pipeline: scan, critique, heal, verify. The app supplies a domain pack — detectors, clauses, prompts. Nothing else. 14 code detectors, 13 legal signals, registered in one map." |
| 0:30–0:38 | Portal → click *Launch CodeMedic AI* | click | "Let me prove it in product one." |
| 0:38–0:55 | CodeMedic, left panel | Click preset **SQL Injection API**, then **Run security audit** | "A real Express handler with a string-concatenated query. One click. No key, no config." |
| 0:55–1:12 | CodeMedic, Live agents terminal | let SSE stream | "Scanner chunks the file with line anchors. The critic scores 94 — critical SQL injection — and cites the exact line. The healer rewrites the query as a parameterised call. The verifier re-runs the same detectors on the patch." |
| 1:12–1:28 | CodeMedic, Findings → Diff | click *Diff*, click *Download fixed file* | "Side-by-side: vulnerable versus patched, with the exact edit. The download keeps my filename, so the fix drops straight back into the repo. Report exports as markdown or JSON." |
| 1:28–1:36 | CodeMedic header | click *Same core → LexGuard AI* | "Same core. Different universe." |
| 1:36–1:52 | LexGuard, left panel | Click preset **Inflated Tax Invoice**, then **Run fraud audit** | "An invoice where the tax arithmetic does not reconcile and the bank details changed 'by notice'. 13 legal signals run over it." |
| 1:52–2:08 | LexGuard, Risk heatmap | point at cards | "Critical: bank details changed by notice. Critical: invoice arithmetic does not reconcile. Exposed commitment quantified at fifty-two thousand — up to a hundred and thirty thousand with penalties." |
| 2:08–2:22 | LexGuard, Counter-draft → *Print / Save as PDF* | click, open print preview | "It does not stop at flagging. Four redlines, a clause-by-clause counter-proposal, an audit notice, and an A4 PDF ready to send to counsel." |
| 2:22–2:30 | Back to portal | hover the shared core node | "Two products. One skeleton. If I delete either app, the other still builds. That is Skeleton Crew — and it is live in the README." |

**Shot list / setup notes**

- Start from `npm install && npm run dev`, three tabs: `3000`, `3001`, `3002`.
- Use the presets — they are the richest, most reproducible path.
- Keep the portal badge visible at 0:00 and 2:22: it reads *Live Sandbox Engine Active*, which is
  the "no key required" proof.
- If you have a key, record one 10-second segment with it live (badge flips to the provider name)
  as a bonus cut.

---

## 4. Social posts

### X (Twitter) — 277 characters (limit 280)

```
Most "multi-agent" demos are one product with four prompts.

AegisCore: one 4-agent core (scan → critique → heal → verify) powering CodeMedic AI (code security) + LexGuard AI (contract fraud). Zero duplicated agent code.

github.com/kumarramjag43/aegiscore #Kiroween #AWS #Kiro
```

### X — thread continuation (optional, 3 posts)

```
2/ The trick: the reusable part isn't a prompt library — it's the audit workflow. Detectors, clause
anchors, risk scoring, healing, and a verifier that re-runs the SAME detectors on the fix. Domains plug
in as data. 14 code detectors and 13 legal signals live in one registry.
```

```
3/ Zero-friction judging: no key, no DB, no seed. Deterministic analyzers run the real pipeline in ~2s,
and the same interface upgrades to OpenAI / Gemini / Groq / Claude the moment a key appears.
```

```
4/ Shipped as a monorepo: portal + 2 Next.js apps + core package, 32 tests, 3 production builds, Kiro
specs and hooks in .kiro/. MIT licensed. Clone it, hover the portal map, watch one core light up both
industries.
```

### LinkedIn

```
We just shipped AegisCore for the Kiroween 2026 hackathon — and it takes the "Skeleton Crew" brief
literally: one multi-agent core powering two production applications.

The reusable piece is not a prompt library or a UI kit. It is the audit workflow itself:

1. Scanner — chunks the artefact, keeping exact line numbers or clause anchors
2. Risk Critic — detects flaws, scores 0–100, cites the evidence
3. Auto-Healer — writes the exact replacement (patched code, or a legally safer clause)
4. Verifier — re-runs the same detectors on the fix, so "fixed" is measured, not claimed

That pipeline drives two products that have nothing in common:

• CodeMedic AI — audits code and API handlers, then hands back a downloadable patched file
• LexGuard AI — audits contracts and invoices, quantifies financial exposure, and drafts a
  clause-by-clause counter-proposal as an A4 PDF for counsel

14 code detectors and 13 legal signals are just two entries in one registry. Delete either app and
the other still builds.

Deliberate engineering choices:
— Deterministic analyzers when there is no API key, so judges (and you) get a full audit in about two
  seconds with zero setup; the same interface switches to OpenAI, Gemini, Groq or Claude when a
  key is present
— Verification by shared detectors, not a second opinion
— Spec-first Kiro workflow: EARS requirements, Mermaid design, 64-row edge-case matrix and a
  validation log committed next to the code
— 32 tests, 4 typechecked workspaces, 3 production builds, MIT licensed, deployable to Vercel or
  Render from the included configs

Repo: https://github.com/kumarramjag43/aegiscore

Curious what domain you would point a four-agent audit core at next — IaC? Kubernetes? Privacy
policies?

#Kiroween #AWS #Kiro #AIEngineering #MultiAgent #DevSecOps #LegalTech #OpenSource
```

### Short blurb (for a community Discord/Slack, 2 lines)

```
AegisCore: one four-agent audit core (scan → critique → heal → verify) powering two shipped apps —
CodeMedic AI (code security patcher) and LexGuard AI (contract/invoice fraud detector). Runs with no
API key. github.com/kumarramjag43/aegiscore
```

---

## 5. Judging map — where to look

| Claim | Evidence in the repo |
| --- | --- |
| One core, no duplicated agent logic | `packages/aegis-core/src/` — pipeline, scoring, SSE, report; no prompt or detector inside either app |
| Two independent products | `apps/codemedic-ai`, `apps/lexguard-ai` — each only supplies a `DomainPack` and its UI |
| Domain packs are data | `packages/aegis-core/src/packs/code-security/`, `.../contract-fraud/`, registry in `packs/index.ts` |
| Real-time agent steps | `createSseStream` + `apps/*/app/api/audit/route.ts` + `AgentTerminal` |
| Verified fixes | `verify.ts` re-runs pack detectors; per-check results in every report |
| No-key demo | `resolveLlmClient` sandbox path; `DEMO_MODE=true` in `render.yaml` |
| Kiro native | `.kiro/specs/aegis-core/{requirements,design,tasks,test-matrix,validation-log}.md`, `.kiro/steering/architecture-rules.md`, `.kiro/hooks/*.json` |
| Quality gates | `npm run verify` → typecheck ×4, 32/32 tests, 3 production builds |
| Deployable | `apps/*/vercel.json`, `render.yaml`, `scripts/deploy-vercel.sh`, `DEPLOY.md` |
| Open source | `LICENSE` (MIT) |
| Story / write-up | `BLOG_POST.md`, `README.md`, `docs/screenshots/` |

---

## 6. Pre-submission checklist

- [x] Deploy all three surfaces to Vercel and record the URLs in the README table and section 1.
- [ ] Record the 2:30 demo video with the script in section 3; upload to YouTube (unlisted is fine).
- [ ] Confirm the video is not gated by age/region restrictions — judges must be able to play it.
- [ ] Post the X and LinkedIn copy on submission day; add the video link to the first post.
- [ ] Verify the repo is public and the default branch is `main`:
      `curl -s https://api.github.com/repos/kumarramjag43/aegiscore | grep -E '"private"|default_branch"'`
- [ ] Open the deployed portal once on mobile to confirm the layout does not break.
