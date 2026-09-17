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
# All three must resolve to this VPS. `www.` and `classroom.` serve nothing of
# their own - they exist so Traefik can get a certificate for each and answer
# with the 301 to the apex. Without the record the redirect never happens: the
# browser fails to connect before it reaches us.
for h in "$APEX" "www.$APEX" "classroom.$APEX"; do
  if resolves "$h"; then
    ok "$h resolves"
  elif [ "$h" = "classroom.$APEX" ]; then
    bad "$h does not resolve - add its A record back, pointed at this VPS, or the redirect to the apex cannot fire"
  else
    bad "$h does not resolve"
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
probe /api/attendance/reminders "Attendance reminders (in-app action, not cron)"

head2 "Crontab"
# Most scheduled work runs in-process from src/instrumentation.ts and needs no
# crontab. These two do not: their logic lives in the route, so an HTTP caller is
# the only thing that ever runs them.
#
# /api/attendance/reminders is deliberately absent - it is POST-only, needs a
# signed-in session and takes a classroom and session id from the body. It is an
# in-app action fired from the attendance workspace, not a sweep.
NEEDS_CRON="demo/reminders fees/monthly-reminders"

# A crontab entry is useless without the secret: with CRON_SECRET unset,
# authorizeCronRequest accepts only a signed-in admin, so every cron call 403s.
if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  if docker exec "$CONTAINER" sh -c '[ -n "${CRON_SECRET:-}" ]' 2>/dev/null; then
    ok "CRON_SECRET is set"
  else
    bad "CRON_SECRET is unset - every scheduled-job call 403s, whatever the crontab says"
  fi
fi

cron="$(crontab -l 2>/dev/null || true)"
if [ -z "$cron" ]; then
  bad "root has no crontab, so nothing calls:"
  for job in $NEEDS_CRON; do echo "         /api/$job"; done
  echo "         (the ask-coach, homework, class-session, attendance-nudge,"
  echo "          monthly-summary, course-completion, pause-expiry and tournament"
  echo "          jobs are unaffected - they run in-process from instrumentation.ts)"
  echo "         Check another user's crontab, /etc/cron.d, systemd timers or an"
  echo "         n8n Schedule trigger before adding entries, to avoid doubling up."
else
  urls="$(printf '%s\n' "$cron" | grep -nE 'https?://' || true)"
  stale="$(printf '%s\n' "$urls" | grep -v "//$APEX/" | grep . || true)"
  if [ -n "$stale" ]; then
    bad "crontab entries name a host other than $APEX:"
    printf '%s\n' "$stale" | sed 's/^/         /'
  elif [ -z "$urls" ]; then
    ok "crontab hardcodes no host - cron-call.sh reads LMS_HOST from .env"
  else
    ok "every crontab URL names $APEX"
  fi
  for job in $NEEDS_CRON; do
    printf '%s\n' "$cron" | grep -q "$job" \
      && ok "cron calls /api/$job" \
      || note "no cron entry calls /api/$job - that job only runs when an admin triggers it by hand"
  done
fi

head2 "Repo files"
# Only this app's own non-canonical hostnames count. A bare `srv*.hstgr.cloud`
# does not: n8n still lives on one legitimately, and the outbound section above
# is what decides whether a host is reachable.
#
# `classroom.` is still wrong here even though it resolves and redirects again.
# A value in `.env` is a URL the app hands out or calls - a callback, a webhook,
# a link in an email - and every one of those wants the apex it will end up on,
# not a 301 that a POST does not survive.
RETIRED="classroom\.$APEX|lms\.srv[0-9]+\.hstgr\.cloud"
if [ -f "$ENV_FILE" ]; then
  if grep -qE "$RETIRED" "$ENV_FILE"; then
    bad "$ENV_FILE names a host that is not the apex - point it at $APEX:"
    grep -nE "$RETIRED" "$ENV_FILE" \
      | sed -E 's/=.*/=<redacted>/' | sed 's/^/         /'
  else
    ok "$ENV_FILE names no non-canonical LMS host"
  fi
else
  note "$ENV_FILE not found in $(pwd) - run this from the deployed checkout"
fi

# Match the Traefik labels only, so the surrounding comments cannot answer the
# check for them. `classroom.` has to appear twice: on the router rule, so the
# host is answered and gets a certificate, and in the canonical regex, so what
# it answers with is the 301 to the apex. One without the other is worse than
# neither - routed but not redirected serves a second copy of the site on a
# second origin, which is exactly what the canonical host is meant to prevent.
traefik_labels="$(grep -E '^\s*-\s*.?traefik\.' docker-compose.yml 2>/dev/null || true)"
routed=0; redirected=0
printf '%s' "$traefik_labels" | grep -q 'routers\.envision\.rule=.*classroom\.' && routed=1
printf '%s' "$traefik_labels" | grep -q 'envision-canonical\.redirectregex\.regex=.*classroom' && redirected=1
if [ "$routed" = 1 ] && [ "$redirected" = 1 ]; then
  ok "docker-compose.yml routes classroom. and 301s it to the apex"
elif [ "$routed" = 1 ]; then
  bad "docker-compose.yml routes classroom. but the canonical regex does not match it - it would serve a second copy of the site instead of redirecting"
elif [ "$redirected" = 1 ]; then
  bad "the canonical regex names classroom. but the router rule does not - Traefik never answers the host, so the redirect never runs"
else
  bad "docker-compose.yml no longer routes classroom. - add it to the router rule and the canonical regex"
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
    (the 301 above does not rescue it - the WebView pins its build host)
EOF

echo
echo "== $pass ok, $warn warnings, $fail failures =="
[ "$fail" -eq 0 ]
