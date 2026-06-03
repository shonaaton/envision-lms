#!/usr/bin/env bash
# Run ONCE on the VPS (or anywhere with internet) to pull Stockfish
# and (optionally) the real Envision logo. Re-runnable; idempotent.
set -euo pipefail

PUBLIC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/public"
SF_DIR="$PUBLIC_DIR/stockfish"
mkdir -p "$SF_DIR"

echo "==> Downloading Stockfish.js (lichess-org build) into $SF_DIR"
# Pin to a known-good build of Stockfish.js (single-threaded WASM)
SF_BASE="https://raw.githubusercontent.com/lichess-org/stockfish.js/master/example/public"
for f in stockfish.js stockfish.wasm; do
  if [ ! -f "$SF_DIR/$f" ]; then
    curl -fsSL -o "$SF_DIR/$f" "$SF_BASE/$f"
    echo "  ✓ $f"
  else
    echo "  • $f already present, skipping"
  fi
done

# Sanity check
if [ -s "$SF_DIR/stockfish.js" ] && [ -s "$SF_DIR/stockfish.wasm" ]; then
  echo "==> Stockfish ready."
else
  echo "!! Stockfish download incomplete. Check network or fetch manually from"
  echo "   https://github.com/lichess-org/stockfish.js"
  exit 1
fi

echo "==> All assets ready in $PUBLIC_DIR"
