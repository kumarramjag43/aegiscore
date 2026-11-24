#!/usr/bin/env bash
# Deploy the three AegisCore surfaces to Vercel as standalone build roots.
#
#   export VERCEL_TOKEN=...        # vercel.com/account/tokens
#   ./scripts/deploy-vercel.sh                 # codemedic -> lexguard -> portal
#   ./scripts/deploy-vercel.sh codemedic       # one surface
#   DRY_RUN=1 ./scripts/deploy-vercel.sh       # pack + resolve projects, no deploy
#
# Why standalone roots: this repo is an npm-workspaces monorepo. Vercel's
# Git-integrated "Root Directory" flow needs the Vercel GitHub App installed;
# without it, uploading a single app directory breaks workspace resolution. So
# each surface is packed into a self-contained directory (the core engine is
# vendored in as a `file:` dependency) and Vercel builds that normally.
#
# Portal env vars are project settings and survive redeploys. Pass CODEMEDIC_URL
# and LEXGUARD_URL to this script to have it re-apply them before the build.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="${TMPDIR:-/tmp}/aegis-vercel"
TARGET="${1:-all}"
API="https://api.vercel.com"

log() { printf '\033[36m>\033[0m %s\n' "$*"; }
die() { printf '\033[31mx %s\033[0m\n' "$*" >&2; exit 1; }

[ -n "${VERCEL_TOKEN:-}" ] || die "Set VERCEL_TOKEN (vercel.com/account/tokens) and re-run."
command -v python3 >/dev/null || die "python3 is required."

jget() { python3 -c "import json,sys;d=json.load(sys.stdin);v=d$1;print(v if v and v != 'None' else '')"; }

api() { # api METHOD PATH [BODY]
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -sS -X "$method" "$API$path" -H "Authorization: Bearer $VERCEL_TOKEN" \
      -H "Content-Type: application/json" -d "$body"
  else
    curl -sS -X "$method" "$API$path" -H "Authorization: Bearer $VERCEL_TOKEN"
  fi
}

resolve_project() { # name -> "<id> <accountId>", creating the project if needed
  local name="$1" json
  json="$(api GET "/v9/projects/$name")"
  if [ -z "$(printf '%s' "$json" | jget "['id']")" ]; then
    log "project $name not found — creating it"
    json="$(api POST "/v11/projects" "{\"name\":\"$name\",\"framework\":\"nextjs\"}")"
  fi
  local id org
  id="$(printf '%s' "$json" | jget "['id']")"
  org="$(printf '%s' "$json" | jget "['accountId']")"
  [ -n "$id" ] && [ -n "$org" ] || die "could not resolve project $name"
  printf '%s %s' "$id" "$org"
}

pack() { # app-dir -> prints the packed directory
  local app="$1" dest="$WORK/$app"
  rm -rf "$dest"
  mkdir -p "$dest/vendor/aegis-core"
  tar -C "$ROOT/apps/$app" -cf - \
    --exclude=node_modules --exclude=.next --exclude=.vercel --exclude='*.tsbuildinfo' . |
    tar -C "$dest" -xf -
  tar -C "$ROOT/packages/aegis-core" -cf - \
    --exclude=node_modules --exclude='*.tsbuildinfo' . |
    tar -C "$dest/vendor/aegis-core" -xf -
  python3 - "$dest" <<'PY'
import json, pathlib, sys
p = pathlib.Path(sys.argv[1]) / "package.json"
m = json.loads(p.read_text())
m["dependencies"]["@aegiscore/core"] = "file:./vendor/aegis-core"
p.write_text(json.dumps(m, indent=2) + "\n")
PY
  printf '%s' "$dest"
}

set_env() { # project-id key value
  api POST "/v10/projects/$1/env?upsert=true" \
    "{\"key\":\"$2\",\"value\":\"$3\",\"type\":\"plain\",\"target\":[\"production\",\"preview\"]}" >/dev/null
}

deploy() { # app-dir project-name
  local app="$1" project="$2" dir ids
  dir="$(pack "$app")"
  ids="$(resolve_project "$project")"
  log "packed apps/$app -> $dir"
  if [ "${DRY_RUN:-0}" = "1" ]; then
    log "DRY_RUN: vercel deploy --prod --yes ($project, ids: $ids)"
    return 0
  fi
  log "deploying $project"
  # shellcheck disable=SC2086
  set -- $ids
  (cd "$dir" &&
    VERCEL_TOKEN="$VERCEL_TOKEN" VERCEL_ORG_ID="$2" VERCEL_PROJECT_ID="$1" VERCEL_TELEMETRY_DISABLED=1 \
      npx -y vercel@latest deploy --prod --yes 2>&1 | tail -n 3)
}

if [ "$TARGET" = "all" ] || [ "$TARGET" = "portal" ]; then
  if [ -n "${CODEMEDIC_URL:-}" ] && [ -n "${LEXGUARD_URL:-}" ]; then
    ids="$(resolve_project aegiscore-portal)"
    # shellcheck disable=SC2086
    set -- $ids
    log "applying portal URLs: $CODEMEDIC_URL , $LEXGUARD_URL"
    if [ "${DRY_RUN:-0}" != "1" ]; then
      set_env "$1" CODEMEDIC_URL "$CODEMEDIC_URL"
      set_env "$1" LEXGUARD_URL "$LEXGUARD_URL"
      set_env "$1" NEXT_PUBLIC_CODEMEDIC_URL "$CODEMEDIC_URL"
      set_env "$1" NEXT_PUBLIC_LEXGUARD_URL "$LEXGUARD_URL"
    fi
  fi
fi

if [ "$TARGET" = "all" ] || [ "$TARGET" = "codemedic" ]; then
  deploy codemedic-ai aegiscore-codemedic
fi
if [ "$TARGET" = "all" ] || [ "$TARGET" = "lexguard" ]; then
  deploy lexguard-ai aegiscore-lexguard
fi
if [ "$TARGET" = "all" ] || [ "$TARGET" = "portal" ]; then
  deploy portal aegiscore-portal
fi

log "done — smoke test: curl -s https://aegiscore-codemedic.vercel.app/api/health"
