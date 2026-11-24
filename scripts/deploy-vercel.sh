#!/usr/bin/env bash
# Deploy all three AegisCore surfaces to Vercel production and wire the portal
# to the product URLs.
#
#   ./scripts/deploy-vercel.sh              # all three, in dependency order
#   ./scripts/deploy-vercel.sh codemedic    # one surface
#
# Auth (either works):
#   vercel login                            # interactive, once per machine
#   export VERCEL_TOKEN=...                 # CI / non-interactive
#
# Each app ships its own vercel.json, so the CLI only needs the app directory.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-all}"

log() { printf '\033[36m>\033[0m %s\n' "$*"; }
die() { printf '\033[31mx %s\033[0m\n' "$*" >&2; exit 1; }

command -v node >/dev/null || die "node is required"

if command -v vercel >/dev/null; then
  VERCEL=(vercel)
else
  log "vercel CLI not installed — using 'npx -y vercel@latest'"
  VERCEL=(npx -y vercel@latest)
fi

"${VERCEL[@]}" whoami >/dev/null 2>&1 ||
  die "Not authenticated. Run 'vercel login' or export VERCEL_TOKEN, then re-run."

deploy() {
  local dir="$1" project="$2"
  log "linking ${project} -> apps/${dir}"
  (cd "${ROOT}/apps/${dir}" && "${VERCEL[@]}" link --yes --project "${project}" >/dev/null)
  log "building and deploying ${project}"
  (cd "${ROOT}/apps/${dir}" && "${VERCEL[@]}" deploy --prod --yes 2>/dev/null | tail -n 1)
}

set_env() {
  local dir="$1" name="$2" value="$3"
  {
    cd "${ROOT}/apps/${dir}"
    "${VERCEL[@]}" env rm "${name}" production --yes >/dev/null 2>&1 || true
    printf '%s' "${value}" | "${VERCEL[@]}" env add "${name}" production >/dev/null
  } || log "could not set ${name} automatically — add it in the Vercel dashboard"
}

CODEMEDIC_URL=""
LEXGUARD_URL=""
PORTAL_URL=""

if [ "${TARGET}" = "all" ] || [ "${TARGET}" = "codemedic" ]; then
  CODEMEDIC_URL="$(deploy codemedic-ai aegis-codemedic)"
  [ -n "${CODEMEDIC_URL}" ] || die "codemedic deploy returned no URL"
fi

if [ "${TARGET}" = "all" ] || [ "${TARGET}" = "lexguard" ]; then
  LEXGUARD_URL="$(deploy lexguard-ai aegis-lexguard)"
  [ -n "${LEXGUARD_URL}" ] || die "lexguard deploy returned no URL"
fi

if [ "${TARGET}" = "all" ]; then
  log "wiring portal -> ${CODEMEDIC_URL} , ${LEXGUARD_URL}"
  set_env portal CODEMEDIC_URL "${CODEMEDIC_URL}"
  set_env portal LEXGUARD_URL "${LEXGUARD_URL}"
  set_env portal NEXT_PUBLIC_CODEMEDIC_URL "${CODEMEDIC_URL}"
  set_env portal NEXT_PUBLIC_LEXGUARD_URL "${LEXGUARD_URL}"
fi

if [ "${TARGET}" = "all" ] || [ "${TARGET}" = "portal" ]; then
  PORTAL_URL="$(deploy portal aegis-portal)"
fi

cat <<EOF

────────────────────────────────────────────────────────────
Live URLs (paste into README.md → "Live demo" table):

  Portal       ${PORTAL_URL:-<unchanged>}
  CodeMedic AI ${CODEMEDIC_URL:-<unchanged>}
  LexGuard AI  ${LEXGUARD_URL:-<unchanged>}

Smoke test:
  curl -s -o /dev/null -w '%{http_code}\\n' "${PORTAL_URL:-http://localhost:3000}/"
  curl -s "${CODEMEDIC_URL:-http://localhost:3001}/api/health"
  curl -s "${LEXGUARD_URL:-http://localhost:3002}/api/health"
────────────────────────────────────────────────────────────
EOF
