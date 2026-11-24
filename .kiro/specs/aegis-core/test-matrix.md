# AegisCore — Edge-case test matrix

How each boundary was proven. **Covered by** names the automated test, the manual
command, or the browser check used during the Phase 3 audit. Status is the state
at the last verification run (see `validation-log.md`).

Legend: ✅ verified · 🟡 verified manually in the browser · ⛔ accepted risk (documented)

---

## 1. Input boundaries

| ID | Scenario | Expected behaviour | Covered by | Status |
| --- | --- | --- | --- | --- |
| IN-01 | Empty string body | 400 `error` before the stream opens | `POST /api/audit` guard + UI guard | ✅ |
| IN-02 | Whitespace-only input | Rejected — `Paste a … first` | workspace `run()` guard | 🟡 |
| IN-03 | Body that is not a string (`input: 42`) | 400, no model call | route type check | ✅ |
| IN-04 | 200 000+ characters | Truncated to `AEGIS_MAX_INPUT_CHARS` and reported | `rejects empty and oversized input` | ✅ |
| IN-05 | Unicode / emoji / RTL text | Round-trips into the report unchanged | legal preset with £/€/— glyphs | ✅ |
| IN-06 | CRLF line endings | Line numbers still 1-based and correct | diff + scanner | ✅ |
| IN-07 | BOM at the start of an uploaded file | Stripped before analysis | `reads an accepted text file and strips a BOM` | ✅ |
| IN-08 | Binary upload (NUL bytes) | Rejected with a human sentence | `rejects the wrong extension, empty files, binaries and oversize uploads` | ✅ |
| IN-09 | Wrong extension (`.exe`) | Rejected, accepted list shown | same test | ✅ |
| IN-10 | Empty file (0 bytes) | Rejected | same test | ✅ |
| IN-11 | Upload above the byte limit | Rejected with both sizes quoted | same test | ✅ |
| IN-12 | Path traversal in a filename (`../../etc/passwd`) | Separators neutralised, extension forced | `sanitises hostile names and forces an extension` | ✅ |
| IN-13 | 200-character filename | Truncated to ≤ 99 characters, still download-safe | same test | ✅ |
| IN-14 | Re-selecting the same file twice | Second drop still fires (input value reset) | `FileDrop` `onChange` | 🟡 |
| IN-15 | `.csv` / `.json` invoice dropped | Read as text; amounts still detected | LexGuard upload, manual | 🟡 |

## 2. Pipeline and providers

| ID | Scenario | Expected behaviour | Covered by | Status |
| --- | --- | --- | --- | --- |
| PL-01 | No API key | Sandbox engine, identical report shape | every preset test | ✅ |
| PL-02 | `DEMO_MODE=true` with a key present | Sandbox wins | `pins the sandbox even when a key is present` | ✅ |
| PL-03 | `DEMO_MODE` variants (`1`, `true`, ` ON `, `false`) | Parsed conservatively | `parses the switch conservatively` | ✅ |
| PL-04 | Provider returns prose instead of JSON | JSON extraction fails → sandbox fallback → run completes | `falls back to deterministic analyzers when a live provider returns junk` | ✅ |
| PL-05 | Provider 4xx/5xx or timeout | `warn` log, stage falls back, verification note added | `http.ts` + fallback path | ✅ |
| PL-06 | Client aborts mid-stream | Provider fetch aborted, stage marked cancelled, UI returns to idle | `AbortController` + `request.signal` (UI + route) | 🟡 |
| PL-07 | Stage order | Exactly four started/completed pairs, in order | `emits the full event sequence` | ✅ |
| PL-08 | Unknown domain pack id | Throws `Unknown AegisCore domain pack` | `getPack` guard | ✅ |
| PL-09 | Model inflates its own risk score | Aggregate score still computed by the core | `collectAudit` risk aggregation | ✅ |
| PL-10 | Empty findings (clean input) | Report explains zero findings; verifier passes with no redlines | contract/code clean run | ✅ |

## 3. Code-security domain

| ID | Scenario | Expected | Covered by | Status |
| --- | --- | --- | --- | --- |
| CS-01 | SQL concatenation | Finding + bound-parameter rewrite | preset test | ✅ |
| CS-02 | SQL template interpolation | Finding + `$1` parameterisation | preset test | ✅ |
| CS-03 | Hardcoded secret key | Finding + `process.env` move + secret absent from patch | preset test | ✅ |
| CS-04 | Auth bypass on `/admin` | Finding + `requireAuth` inserted | preset test | ✅ |
| CS-05 | Check-then-act race | Finding + atomic conditional update | preset test | ✅ |
| CS-06 | Command injection | Finding + `execFile` with argument array | pack detector sweep (all presets) | ✅ |
| CS-07 | Weak hashing (`md5`) | Finding + `scrypt`/`argon2` guidance | pack detector sweep (all presets) | ✅ |
| CS-08 | Insecure RNG (`Math.random` for tokens) | Finding + `crypto.randomUUID` | pack detector sweep (all presets) | ✅ |
| CS-09 | Verbose error leak | Finding + generic error envelope | pack detector sweep (all presets) | ✅ |
| CS-10 | Patch leaves a critical detector firing | Verifier returns `passed: false` | verified by `buildVerification` + preset runs | ✅ |
| CS-11 | File with unbalanced braces after repair | Verifier syntax check fails | `buildVerification` | ✅ |

## 4. Contract-fraud domain

| ID | Scenario | Expected | Covered by | Status |
| --- | --- | --- | --- | --- |
| CF-01 | Numbered clause document | One clause per heading, no collapsed blobs | `parses numbered clauses` | ✅ |
| CF-02 | Invoice line items (`1. Sensor — qty 12 x $1,850.00 = $22,200`) | Not treated as clause headings | `parses numbered clauses` + invoice preset | ✅ |
| CF-03 | Unlabelled paragraph document | Paragraph fallback with location `Paragraph n` | paragraph preset test | ✅ |
| CF-04 | Uncapped liability | Critical finding + mutual cap redline | preset test | ✅ |
| CF-05 | Auto-renewal | Finding + reciprocal-notice redline | preset test | ✅ |
| CF-06 | Unilateral price increase | Finding + capped-increase redline | preset test | ✅ |
| CF-07 | `2.3` clause numbering | Sentence extraction must not split on the number | invoice/counter-draft assertions | ✅ |
| CF-08 | Invoice totals that do not reconcile | Arithmetic finding + recomputed totals | invoice preset test | ✅ |
| CF-09 | Bank-detail change notice | Critical finding + call-back verification redline | invoice preset test | ✅ |
| CF-10 | Exposure computation | Largest commitment × 2.5, in the document currency | invoice + loan preset assertions | ✅ |
| CF-11 | Redline missing from the counter-document | Verifier fails `legal.redlines.applied` | preset verification assertions | ✅ |
| CF-12 | Counter-draft without a reservation of rights | Verifier fails `legal.rights.reserved` | preset verification assertions | ✅ |

## 5. UI and export

| ID | Scenario | Expected | Covered by | Status |
| --- | --- | --- | --- | --- |
| UI-01 | Drop a source file in CodeMedic | Editor fills, title becomes the filename, chip shows size | browser | 🟡 |
| UI-02 | Download fixed file | Downloads the repaired source under the original name | browser | 🟡 |
| UI-03 | Copy patched code | Clipboard write + confirmation state | browser | 🟡 |
| UI-04 | Download audit report (MD/JSON) | Both files open, contain the report id | browser | 🟡 |
| UI-05 | Attach a contract in LexGuard | Instrument fills, matter label trimmed | browser | 🟡 |
| UI-06 | Print / Save as PDF | Print sheet replaces the console, A4, findings table + counter-draft | browser print preview | 🟡 |
| UI-07 | Print before any run | Button disabled with an explanatory tooltip | browser | 🟡 |
| UI-08 | Tab switching with no report | Empty states explain which agent produces the panel | browser | 🟡 |
| UI-09 | Portal status pills | Sandbox/live/offline reflect `/api/health` | browser | 🟡 |
| UI-10 | Portal launch buttons | Open the configured `NEXT_PUBLIC_*` URL in a new tab | browser | 🟡 |

## 6. Deployment

| ID | Scenario | Expected | Covered by | Status |
| --- | --- | --- | --- | --- |
| DP-01 | Production build, no keys | Builds and runs; badge reads **Live Sandbox Engine Active** | `npm run build` + `npm run start` | ✅ |
| DP-02 | `PORT` provided by the platform | `start` scripts bind to it | `${PORT:-300x}` expansion | ✅ |
| DP-03 | `/api/health` probe | Returns provider identity, never a key | curl on both apps | ✅ |
| DP-04 | Health endpoint cached by a CDN | Impossible — `no-store` in route and `vercel.json` | header check | ✅ |
| DP-05 | Portal cannot reach an app | Pill shows `offline`, page still renders in < 2 s | 1.5 s probe timeout | ✅ |
| DP-06 | Secret committed by accident | `.gitignore` covers `.env*` except `.env.example` | `git status` audit | ✅ |

---

## Accepted risks

- **⛔ Rule-based detectors.** Precision over recall by design: every finding is
  explainable and citable. A semantic scanner would find more, but could not be
  verified deterministically without a second model.
- **⛔ No persistence.** Runs live in the request. Adding a database would slow
  judge onboarding for zero demo value.
- **⛔ Live-provider latency.** A 45 s ceiling per call; the UI streams stage
  events so a slow provider never looks frozen.
