#!/usr/bin/env bash
# Call one of this app's scheduled-job endpoints from cron.
#
#   scripts/cron-call.sh /api/demo/reminders
#
# The secret is read from `.env` at call time rather than written into the
# crontab, so `crontab -l` never exposes it and rotating CRON_SECRET needs no
# crontab edit. The host comes from LMS_HOST in the same file, so this keeps
# working across a domain move - which is the whole failure this guards against.
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

path="${1:-}"
if [ -z "$path" ]; then
  echo "usage: $(basename "$0") /api/<endpoint>" >&2
  exit 2
fi

read_env() {
  # Last assignment wins, quotes stripped, `export ` prefix tolerated.
  sed -nE "s/^[[:space:]]*(export[[:space:]]+)?$1=[\"']?(.*[^\"'])[\"']?[[:space:]]*$/\2/p" .env | tail -n 1
}

[ -f .env ] || { echo "cron-call: no .env in $(pwd)" >&2; exit 1; }

secret="$(read_env CRON_SECRET)"
host="$(read_env LMS_HOST)"
[ -n "$secret" ] || { echo "cron-call: CRON_SECRET is not set in .env" >&2; exit 1; }
[ -n "$host" ] || { echo "cron-call: LMS_HOST is not set in .env" >&2; exit 1; }

url="https://${host}${path}"
started="$(date -Is)"

# Fail on a 4xx/5xx so cron's own mail catches it. `--fail-with-body` keeps the
# response for the log and needs curl 7.76+; older curl gets plain `--fail`,
# which exits non-zero but discards the body.
fail_flag="--fail"
if curl --help all 2>/dev/null | grep -q -- "--fail-with-body"; then
  fail_flag="--fail-with-body"
fi

body="$(curl -sS "$fail_flag" -m 120 -X POST \
  -H "x-cron-secret: ${secret}" \
  -H "Content-Type: application/json" \
  "$url" 2>&1)"
status=$?

if [ "$status" -eq 0 ]; then
  echo "$started ok   $path ${body:0:400}"
else
  echo "$started FAIL $path (curl exit $status) ${body:0:400}" >&2
fi
exit "$status"
