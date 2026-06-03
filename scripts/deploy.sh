#!/usr/bin/env bash
# One-shot deploy script for the Hostinger VPS.
# Run from the `lms/` directory:  bash scripts/deploy.sh
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# 1. .env check
if [ ! -f .env ]; then
  echo "!! .env not found. Copy and fill it first:"
  echo "   cp .env.example .env && nano .env"
  exit 1
fi

# 2. Pull Stockfish if missing
if [ ! -s public/stockfish/stockfish.js ] || [ ! -s public/stockfish/stockfish.wasm ]; then
  echo "==> Stockfish not found, fetching..."
  bash scripts/setup-assets.sh
fi

# 3. Ensure shared docker network exists (Traefik / n8n network)
if ! docker network ls --format '{{.Name}}' | grep -qx root_default; then
  echo "==> Creating 'root_default' docker network (shared with n8n + Traefik)"
  docker network create root_default
fi

# 4. Build & start
echo "==> Building and starting envision-lms..."
docker compose up -d --build

# 5. Tail logs briefly to confirm boot
echo "==> Tailing logs for 15s..."
( timeout 15 docker compose logs -f envision-lms || true )

echo "==> Done. Visit https://platform.envisionchessacademy.com"
echo "   (DNS A record must point at this VPS, Traefik will issue TLS automatically)"
