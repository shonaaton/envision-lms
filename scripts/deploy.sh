#!/usr/bin/env bash
# One-shot deploy script for the Hostinger VPS.
# Run from the `lms/` directory:  bash scripts/deploy.sh
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

log() {
  echo "==> $*"
}

fail() {
  echo "!! $*" >&2
  exit 1
}

trap 'echo "!! Deploy failed near line ${LINENO}: ${BASH_COMMAND}" >&2' ERR

log "LMS deploy started from $(pwd)"

run_node_script() {
  local script="$1"
  if command -v node >/dev/null 2>&1; then
    timeout 30 node "$script"
    return
  fi

  log "Node.js not found on host; running ${script} inside Docker..."
  timeout 90 docker run --rm \
    --env-file .env \
    -v "$PWD:/app:ro" \
    -w /tmp/lms-check \
    node:20-alpine \
    sh -lc "npm install mongodb@6.8.0 --no-save --omit=dev --ignore-scripts >/tmp/npm-install.log && cp /app/${script} ./check-mongodb-access.cjs && node ./check-mongodb-access.cjs"
}

# 1. .env check
if [ ! -f .env ]; then
  echo "!! .env not found. Copy and fill it first:" >&2
  echo "   cp .env.example .env && nano .env"
  exit 1
fi

command -v docker >/dev/null 2>&1 || fail "Docker is not installed or not available in PATH."
docker compose version >/dev/null 2>&1 || fail "Docker Compose is not available."

# 2. Pull Stockfish if missing
if [ ! -s public/stockfish/stockfish.js ] || [ ! -s public/stockfish/stockfish.wasm ]; then
  log "Stockfish not found, fetching..."
  timeout 180 bash scripts/setup-assets.sh || fail "Stockfish setup did not finish within 3 minutes."
fi

# 3. Check MongoDB Atlas access before rebuilding
run_node_script scripts/check-mongodb-access.cjs || fail "MongoDB Atlas check failed or timed out."

# 4. Ensure shared docker network exists (Traefik / n8n network)
if ! docker network ls --format '{{.Name}}' | grep -qx root_default; then
  log "Creating 'root_default' docker network (shared with n8n + Traefik)"
  docker network create root_default
fi

# 5. Build & start
log "Building and starting envision-lms..."
docker compose up -d --build

# 6. Tail logs briefly to confirm boot
log "Tailing logs for 15s..."
( timeout 15 docker compose logs -f envision-lms || true )

APP_URL="$(grep -E '^NEXT_PUBLIC_APP_URL=' .env | tail -1 | cut -d= -f2- | tr -d '\"')"
if [ -z "$APP_URL" ]; then
  LMS_HOST_VALUE="$(grep -E '^LMS_HOST=' .env | tail -1 | cut -d= -f2- | tr -d '\"')"
  if [ -n "$LMS_HOST_VALUE" ]; then
    APP_URL="https://${LMS_HOST_VALUE}"
  fi
fi

log "Done. Visit ${APP_URL:-your configured LMS domain}"
echo "   (DNS A record must point at this VPS, Traefik will issue TLS automatically)"
