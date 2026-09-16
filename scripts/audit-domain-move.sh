#!/usr/bin/env bash
# Read-only audit of everything a domain move can silently break.
# Run on the VPS from the `lms/` directory:  bash scripts/audit-domain-move.sh
#
# Changing the apex does not break the app - it breaks the things that hold a
# copy of the old URL: webhook providers, the crontab, and outbound URLs in
# `.env`. None of those report a failure anywhere you would look, so this walks
# them one by one. It only reads and probes; it never writes.
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

APEX="${1:-envisionchessacademy.com}"
CONTAINER="${LMS_CONTAINER:-envision-lms}"
ENV_FILE=".env"

pass=0
warn=0
fail=0

ok()   { echo "  [ ok ] $*"; pass=$((pass + 1)); }
bad()  { echo "  [FAIL] $*"; fail=$((fail + 1)); }
note() { echo "  [warn] $*"; warn=$((warn + 1)); }
head2() { echo; echo "== $* =="; }

# Values of anything secret-shaped are never printed, only their host.
host_of() {
  printf '%s' "$1" | sed -E 's#^[a-zA-Z][a-zA-Z0-9+.-]*://##; s#/.*$##; s#^[^@]*@##; s#:[0-9]+$##'
}

resolves() {
  local host="$1"
  [ -z "$host" ] && return 1
  # An internal docker name resolves only from inside the container, so treat a
  # name with no dot as internal and check it there instead of on the host.
  if [[ "$host" != *.* ]]; then
    docker exec "$CONTAINER" getent hosts "$host" >/dev/null 2>&1
    return
  fi
  getent hosts "$host" >/dev/null 2>&1
}

head2 "DNS"
for h in "$APEX" "www.$APEX" "classroom.$APEX"; do
  if resolves "$h"; then
    if [ "$h" = "classroom.$APEX" ]; then
      note "$h still resolves - it is retired; confirm nothing is pointed at it before deleting the record"
    else
      ok "$h resolves"
    fi
  else
    if [ "$h" = "classroom.$APEX" ]; then
      ok "$h does not resolve (retired, as intended)"
    else
      bad "$h does not resolve"
    fi
  fi
done

head2 "Runtime env inside $CONTAINER"
if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  bad "container $CONTAINER is not running - skipping every container check"
else
  for var in LMS_HOST NEXTAUTH_URL NEXT_PUBLIC_APP_URL NEXT_PUBLIC_MARKETING_URL; do
    value="$(docker exec "$CONTAINER" printenv "$var" 2>/dev/null || true)"
    if [ -z "$value" ]; then
      bad "$var is unset in the container - the socket.io CORS allowlist ends up empty and live tournament boards refuse every origin"
    elif [ "$(host_of "$value")" = "$APEX" ]; then
      ok "$var = $value"
    else
      bad "$var = $value (expected $APEX)"
    fi
  done

  # These are outbound calls the app makes. A host that does not resolve means
  # the feature fails at the fetch with nothing but a generic error in the log.
  head2 "Outbound URLs the app calls"
  for var in ASK_COACH_EMAIL_WEBHOOK_URL EMAIL_AUTOMATION_WEBHOOK_URL \
             PASSWORD_RESET_EMAIL_WEBHOOK_URL KRAYA_API_URL KRAYA_CALLS_API_URL \
             GOOGLE_BUSINESS_REDIRECT_URI; do
    value="$(docker exec "$CONTAINER" printenv "$var" 2>/dev/null || true)"
    if [ -z "$value" ]; then
      note "$var is unset"
      continue
    fi
    h="$(host_of "$value")"
    if resolves "$h"; then
      ok "$var -> $h resolves"
    else
      bad "$var -> $h does NOT resolve; this feature is dead"
    fi
  done
fi

head2 "App endpoints on the apex"
# Each of these is reached by something outside this repo. A 2xx/4xx means the
# route is executing; a 000 means the host or TLS is wrong, and a 3xx means the
# caller is on a redirecting host and its POST body is being dropped.
probe() {
  local path="$1" label="$2"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X POST \
    -H 'Content-Type: application/json' -d '{}' "https://$APEX$path" || echo 000)"
  case "$code" in
    000) bad "$label ($path) unreachable" ;;
    3*)  bad "$label ($path) returned $code - a redirect drops a webhook body" ;;
    *)   ok "$label ($path) -> $code" ;;
  esac
}
probe /api/crm/kraya/webhook "Kraya CRM webhook"
probe /api/payments/webhook "Razorpay webhook"
probe /api/webhooks/whatsapp "WhatsApp webhook"
probe /api/demo/reminders "Demo reminders + lead-owner follow-ups"
probe /api/fees/monthly-reminders "Monthly invoice reminders"
probe /api/attendance/reminders "Attendance reminders"

head2 "Crontab"
cron="$(crontab -l 2>/dev/null || true)"
if [ -z "$cron" ]; then
  note "root has no crontab - if the reminder jobs run from n8n or another user, check there"
else
  stale="$(printf '%s\n' "$cron" | grep -nE 'https?://' | grep -v "//$APEX/" || true)"
  if [ -n "$stale" ]; then
    bad "crontab entries name a host other than $APEX:"
    printf '%s\n' "$stale" | sed 's/^/         /'
  else
    ok "every crontab URL names $APEX"
  fi
  for job in demo/reminders fees/monthly-reminders attendance/reminders; do
    printf '%s\n' "$cron" | grep -q "$job" \
      && ok "cron calls /api/$job" \
      || note "no cron entry calls /api/$job - that job only runs when an admin triggers it by hand"
  done
fi

head2 "Repo files"
if [ -f "$ENV_FILE" ]; then
  if grep -qE "classroom\.$APEX|srv[0-9]+\.hstgr\.cloud" "$ENV_FILE"; then
    bad "$ENV_FILE still names a retired host:"
    grep -nE "classroom\.$APEX|srv[0-9]+\.hstgr\.cloud" "$ENV_FILE" \
      | sed -E 's/=.*/=<redacted>/' | sed 's/^/         /'
  else
    ok "$ENV_FILE names no retired host"
  fi
else
  note "$ENV_FILE not found in $(pwd) - run this from the deployed checkout"
fi

if grep -q "classroom" docker-compose.yml 2>/dev/null; then
  note "docker-compose.yml still mentions classroom. - check the router rule and the canonical regex"
else
  ok "docker-compose.yml has no classroom. routing"
fi

head2 "Cannot be checked from here - confirm in each dashboard"
cat <<EOF
  - Kraya: Settings > Webhook URL  =  https://$APEX/api/crm/kraya/webhook
    (and that the secret there still equals KRAYA_WEBHOOK_SECRET)
  - Razorpay: Settings > Webhooks  =  https://$APEX/api/payments/webhook
  - Meta / WhatsApp: app webhook callback  =  https://$APEX/api/webhooks/whatsapp
  - Google Cloud console: authorised redirect URI
      =  https://$APEX/api/auth/google-business/callback
  - Meta Events Manager: domain verification and allowed domains list
  - Android: any APK built against classroom. must be rebuilt and redistributed
EOF

echo
echo "== $pass ok, $warn warnings, $fail failures =="
[ "$fail" -eq 0 ]
