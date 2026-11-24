# Validation log

Captured evidence for the Phase 3 audit. Every block below is real terminal
output from this repository at the commit that follows the Phase 2 upgrade —
nothing is reconstructed from memory.

**Environment:** Linux container, 16 GB RAM, no GPU. `node v24.22.2`,
`npm 12.2.2`. Next.js `15.5.29`, React `19.1.10`, TypeScript `5.9.3`.
Baseline commit before the upgrade: `99b9193`.

---

## 1. Typecheck — four workspaces

```
$ npm run typecheck
npm notice run @aegiscore/core@1.0.0 typecheck
npm notice run tsc --noEmit
npm notice run @aegis/codemedic-ai@1.0.0 typecheck
npm notice run @aegis/lexguard-ai@1.0.0 typecheck
npm notice run @aegis/portal@1.0.0 typecheck
$ echo $?
0
```

Zero diagnostics. `strict`, `noEmit`, `moduleResolution: bundler` in every
workspace.

## 2. Test suite — 40 offline cases

```
$ npm test
ℹ tests 32
ℹ suites 9
ℹ pass 32
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 241.88
```

The suite runs the real pipeline (`pace: 0`) with an injectable provider: no
network, no API key, no mocking of pipeline internals. Seven cases are new in
this phase (`file intake`, `demo mode`).

## 3. Production builds — three apps

```
$ npm run build
✓ Compiled successfully   (portal,    routes: /, /_not-found, /icon.svg)
✓ Compiled successfully   (codemedic, routes: /, /api/audit, /api/health)
✓ Compiled successfully   (lexguard,  routes: /, /api/audit, /api/health)
```

`npm run verify` chains typecheck → test → build and exits `0`:

```
$ npm run verify > /dev/null 2>&1; echo $?
0
```

## 4. Runtime smoke test

```
$ for p in 3000 3001 3002; do curl -s -o /dev/null -w "$p:%{http_code} " http://localhost:$p/; done
3000:200 3001:200 3002:200

$ curl -s localhost:3001/api/health | head -c 120
{"ok":true,"app":"codemedic-ai","domain":"code-security","label":"Code & API Security","active":{"id":"sandbox","label":
```

Health contract returns provider identity only — no key material, `no-store`
header on the route and in `vercel.json`.

## 5. End-to-end browser QA (Chromium via CDP)

Scripted against the running dev stack: real DOM events, a real file upload
through the hidden `<input type="file">`, real SSE consumption, and a real
`download` attribute capture.

```
PASS  CodeMedic: uploaded file fills the editor — 15 ms
PASS  CodeMedic: attachment chip shows name + size — qa-sample.ts / 301 B
PASS  CodeMedic: file name becomes the target label — qa-sample.ts
PASS  CodeMedic: audit completes on uploaded file — 2426 ms
PASS  CodeMedic: patches produced from the findings — 2 patch(es)
PASS  CodeMedic: 'Download fixed file' exports the original filename — qa-sample.ts
PASS  CodeMedic: report download also available — ["Download fixed file","Download report"]
PASS  LexGuard: audit completes — 3344 ms
PASS  LexGuard: print sheet rendered from the report — {"hasSheet":true,"chars":11712,"hasTable":true}
PASS  LexGuard: dashboard chrome hidden for print — none
PASS  Portal: status pill reports a live engine state — sandbox
PASS  Portal: stats rendered from the core registry — ["4 AGENT STAGES …","14 DETECTORS code-security pack","13 LEGAL SIGNALS contract-fraud pack"]
```

The print assertion ran under `Emulation.setEmulatedMedia({ media: "print" })`,
i.e. the browser's own print stylesheet — the same path `window.print()` takes.
The rendered artefact was captured to `docs/screenshots/07-lexguard-print-pdf.png`
(11,712 characters of printable content).

## 6. Screenshot capture

```
$ node /tmp/shots.mjs
saved 01-portal-hero          1440×960
saved 02-portal-diagram       hover-isolated DevSecOps path
saved 03-codemedic-findings   after a preset run
saved 04-codemedic-diff       side-by-side + both download controls
saved 05-lexguard-heatmap     invoice preset, exposure $52,175–$130,438
saved 06-lexguard-counter-draft
saved 07-lexguard-print-pdf   print media, full page
```

## 7. Deployment configuration

```
$ python3 -c "import json,glob;[json.load(open(p)) for p in glob.glob('apps/*/vercel.json')];print('vercel json valid')"
vercel json valid
```

`render.yaml` parsed by review against the Blueprint spec (`runtime: node`,
`rootDir`, `buildCommand`, `startCommand`, `healthCheckPath`, `sync: false`
secrets). **Not executed against a live Render account** — see residual risk.

## 8. Secret and hygiene scan

```
$ git status --porcelain | grep -E "\.env$|\.env\.local|\.key$|\.pem$"
(no output)

$ git diff | grep -nE "sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|ghp_[A-Za-z0-9]{30,}"
(no output)
```

`.env.example` contains only placeholders; `.gitignore` covers `.env*` except
the example. Test fixtures use obviously fake keys (`sk-not-a-real-key`), and the
exposed-secret preset uses a deliberately synthetic placeholder
(`sk_live_DEMO_PLACEHOLDER_…`) that trips our own detector without resembling a
real provider credential — GitHub push protection rejects anything else.

---

## Residual risk (explicitly unverified)

1. **Live provider path.** No real `GEMINI_API_KEY` / `OPENAI_API_KEY` was
   available in this environment, so live model calls were never executed
   against a provider. The resolution logic, fallback path and JSON extraction
   are covered by tests with a stubbed provider; the HTTP call itself is not.
2. **Hosted deployment.** `vercel.json` and `render.yaml` were validated for
   syntax and reviewed for platform semantics, but no public deployment was
   performed from this container.
3. **Cross-browser print.** Verified in Chromium only. Firefox and Safari honour
   `@page` differently; the artefact degrades to a single-column flow rather
   than breaking.
4. **Very large documents.** The scanner and clause parser were tested to the
   200 000-character request cap; beyond that the input is clamped, which is
   reported but not load-tested for memory.
