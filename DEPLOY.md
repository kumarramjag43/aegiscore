# Deploying AegisCore (public demo URLs in ~5 minutes)

Three Next.js apps, one repository, no database. Both platforms below can run the
whole thing in **demo mode** — the deterministic sandbox executes the real
four-agent pipeline, so judges get a fully working audit with **no API keys**.

| Surface | Workspace | Local | Vercel root directory | Render service |
| --- | --- | --- | --- | --- |
| Portal (launcher) | `@aegis/portal` | `:3000` | `apps/portal` | `aegis-portal` |
| CodeMedic AI | `@aegis/codemedic-ai` | `:3001` | `apps/codemedic-ai` | `aegis-codemedic` |
| LexGuard AI | `@aegis/lexguard-ai` | `:3002` | `apps/lexguard-ai` | `aegis-lexguard` |

---

## Live deployment (what is running now)

| Surface | Production URL | Vercel project |
| --- | --- | --- |
| Portal | https://aegiscore-portal.vercel.app | `aegiscore-portal` |
| CodeMedic AI | https://aegiscore-codemedic.vercel.app | `aegiscore-codemedic` |
| LexGuard AI | https://aegiscore-lexguard.vercel.app | `aegiscore-lexguard` |

All three run the deterministic sandbox engine (`DEMO_MODE=true`), so they work with no API keys.
Verified after deploy: portal `200` with both status pills reading *sandbox*, both
`/api/health` endpoints `ok`, and a full four-agent audit streaming end-to-end in ~2.5 s.

**How they were deployed:** the Vercel GitHub App is not installed on this account, so the
Git-integrated Root Directory flow is unavailable. Instead each app is packed into a standalone
directory with `@aegiscore/core` vendored in as a `file:` dependency, then deployed from there —
`scripts/deploy-vercel.sh` does exactly that (and `DRY_RUN=1` shows the plan without deploying).
Because the apps build outside the workspace, no monorepo path tricks are needed on Vercel.

> Note: `aegis-portal.vercel.app` belongs to an unrelated project, so the portal uses the
> `aegiscore-portal` name. Renaming projects in Vercel does not move their domains — add the domain
> you want in *Project → Settings → Domains*.

<a id="publish-in-three-clicks"></a>
## Publish in three clicks (Vercel UI, needs the GitHub App)

1. **Import** `kumarramjag43/aegiscore` three times (Vercel → *Add New… → Project*),
   and in each import set only **Root Directory**: `apps/codemedic-ai`,
   `apps/lexguard-ai`, `apps/portal`.
2. **On the portal project** add two variables (Production): `CODEMEDIC_URL` and
   `LEXGUARD_URL`, set to the two product URLs Vercel gave you.
3. **Redeploy** the portal (`Deployments → ⋯ → Redeploy`). The launch buttons and
   the live status pills now resolve to the real apps.

No keys, no database, no build-time secrets.

## Publish in one command (CLI)

```bash
export VERCEL_TOKEN=...            # vercel.com/account/tokens
CODEMEDIC_URL=https://aegiscore-codemedic.vercel.app \
LEXGUARD_URL=https://aegiscore-lexguard.vercel.app \
  ./scripts/deploy-vercel.sh       # codemedic -> lexguard -> portal
```

The script packs each app (core vendored in), resolves or creates the Vercel
projects (`aegiscore-codemedic`, `aegiscore-lexguard`, `aegiscore-portal`),
applies the portal URLs, and deploys to production. `DRY_RUN=1` prints the plan
without deploying. It fails immediately with a clear message when `VERCEL_TOKEN`
is missing — it never hangs on a prompt.

---

## Option A — Vercel (three projects, one repo)

Each app ships its own `vercel.json` (framework, security headers, `no-store` on
`/api/*`). Vercel reads the root `package-lock.json`, so dependencies install at
the repo root and each project builds only its own workspace.

1. **Import the repository three times.** Vercel → *Add New… → Project* → pick
   the repo. Repeat for each app.
2. In each project set **Root Directory**:

   | Project | Root Directory |
   | --- | --- |
   | Portal | `apps/portal` |
   | CodeMedic AI | `apps/codemedic-ai` |
   | LexGuard AI | `apps/lexguard-ai` |

   Leave *Framework Preset* as **Next.js**, *Build Command* and *Output
   Directory* at their defaults — the workspace `build` script is enough.
3. **Environment variables** (per project, Production + Preview):

   ```bash
   # both apps — optional, any one switches the engine from sandbox to live
   DEMO_MODE=true            # force sandbox; omit to auto-detect keys
   GEMINI_API_KEY=...        # or OPENAI_API_KEY / GROQ_API_KEY / ANTHROPIC_API_KEY

   # portal only — point status probes and launch buttons at the deployed apps
   CODEMEDIC_URL=https://<codemedic-project>.vercel.app
   LEXGUARD_URL=https://<lexguard-project>.vercel.app
   # optional build-time mirrors, used by the cross-app links inside each product
   NEXT_PUBLIC_CODEMEDIC_URL=https://<codemedic-project>.vercel.app
   NEXT_PUBLIC_LEXGUARD_URL=https://<lexguard-project>.vercel.app
   ```

4. Deploy, then redeploy the portal once the two product URLs exist so its
   status pills and launch buttons resolve.

> No build-time secrets are required: the sandbox path never reads a key, and
> `NEXT_PUBLIC_*` values are public by design (they are just links).

---

## Option B — Render (one blueprint, three services)

`render.yaml` at the repo root declares all three web services with the correct
build/start commands, health checks and optional key slots.

1. Render → **New → Blueprint** → select this repository → **Apply**.
2. Leave the `sync: false` variables empty for a sandbox demo, or paste one
   provider key (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`,
   `ANTHROPIC_API_KEY`).
3. After the first deploy, set on **aegis-portal**:

   ```bash
   NEXT_PUBLIC_CODEMEDIC_URL=https://aegis-codemedic.onrender.com
   NEXT_PUBLIC_LEXGUARD_URL=https://aegis-lexguard.onrender.com
   ```

   and redeploy the portal.

The `start` scripts read `$PORT`, so Render can place each service on its own
public port:

```json
"start": "next start -p ${PORT:-3001}"
```

---

## Demo mode in production

`DEMO_MODE` is resolved inside the core, not in the UI:

```ts
// packages/aegis-core/src/providers/index.ts
export function isDemoMode(env: Env): boolean { /* 1 | true | yes | on */ }

export function resolveLlmClient(env: Env, pack: DomainPack): LlmClient {
  if (isDemoMode(env)) return createSandboxClient(pack);   // pins the deterministic engine
  /* … otherwise first configured provider wins … */
}
```

Behaviour:

| `DEMO_MODE` | API key present | Engine | Badge |
| --- | --- | --- | --- |
| `true` | any | sandbox | **Live Sandbox Engine Active** |
| unset / `false` | yes | that provider | `Live · <provider>` |
| unset / `false` | no | sandbox | **Live Sandbox Engine Active** |

A provider failure never breaks a run: the pipeline falls back to the sandbox
analyzer for that stage, logs `warn`, and records a verification note.

---

## Health checks

Both products expose `GET /api/health` — safe for uptime monitors and used by
the portal's status pills. It returns provider **identity only**, never secrets:

```json
{ "ok": true, "app": "codemedic-ai", "active": { "id": "sandbox", "label": "Aegis Sandbox (deterministic)", "mode": "sandbox" }, "demoMode": false }
```

---

## Pre-flight checklist

```bash
npm ci          # or npm install
npm run verify  # typecheck (4 workspaces) + 40 tests + 3 production builds
npm run start   # serves portal :3000, CodeMedic :3001, LexGuard :3002
```
