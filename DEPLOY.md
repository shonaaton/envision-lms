# Move The LMS To The Academy Domain

The LMS domain is:

```text
https://envisionchessacademy.com
```

Use HTTPS in production, even if you type `http://` first. Traefik should issue SSL and serve the final secure URL.

The apex is canonical. `www.envisionchessacademy.com` is routed too and 301s to
the apex, so old links keep working but only one origin is ever served.

`classroom.envisionchessacademy.com` is gone: the A record is deleted and it has
been dropped from the Traefik rule in `docker-compose.yml`. It does not resolve,
so anything still pointing there fails to connect - it is not redirected. Run
`bash scripts/audit-domain-move.sh` on the VPS to find whatever still names it.

## 1. Point DNS to the VPS

In your domain DNS panel, add both records:

```text
Type: A
Name: @
Value: <your-vps-ip-address>
TTL: Automatic or 300

Type: A
Name: www
Value: <your-vps-ip-address>
TTL: Automatic or 300
```

Keep the existing `classroom` A record as well. Traefik answers on `www` and
`classroom` only to issue the redirect, but each still needs its own certificate
to do that over HTTPS - which it cannot get without a DNS record.

## 2. Update `.env` on the VPS

On the VPS, open the live `.env` file and set:

```env
LMS_HOST="envisionchessacademy.com"
NEXTAUTH_URL="https://envisionchessacademy.com"
NEXT_PUBLIC_APP_URL="https://envisionchessacademy.com"

NEXT_PUBLIC_MARKETING_URL="https://envisionchessacademy.com"
```

`LMS_HOST` is the bare apex - no `www.`, no `https://`. docker-compose builds
all three Traefik host rules from it. `NEXT_PUBLIC_POLICY_BASE_URL` is gone: the legal
pages are routes of this app now, so there is nothing to point elsewhere.

Keep your existing MongoDB, Razorpay, WhatsApp, and `AUTH_SECRET` values unchanged.

## 3. Update connected services

Nothing rescues these automatically. While `classroom.` still resolved the 301 was
already a trap: most HTTP clients re-send a redirected POST as a GET with no body,
so a webhook left on the old URL delivered nothing without failing loudly. Now
that the record is deleted the call does not connect at all. Either way the
provider stays silently dead until it is repointed at the apex by hand.

Every item below lives in a third-party dashboard or on the VPS, not in this repo,
so a deploy cannot fix them. `bash scripts/audit-domain-move.sh` shows which are
still wrong for the ones that are checkable from the host.

Kraya CRM webhook (Settings > the "URL to be hit when a new lead is upserted"
field - leave the secret untouched):

```text
https://envisionchessacademy.com/api/crm/kraya/webhook
```

WhatsApp webhook, set inside the n8n workflow's HTTP node:

```text
https://envisionchessacademy.com/api/webhooks/whatsapp
```

Razorpay webhook:

```text
https://envisionchessacademy.com/api/payments/webhook
```

Google Business callback:

```text
https://envisionchessacademy.com/api/auth/google-business/callback
```

n8n webhook URLs the LMS calls outbound, in `.env`. These are the app calling n8n,
not n8n calling the app, so they never need a public hostname: n8n shares the
`root_default` docker network with this container and answers on its container
name.

```env
ASK_COACH_EMAIL_WEBHOOK_URL="http://root-n8n-1:5678/webhook/lms-email-automation"
EMAIL_AUTOMATION_WEBHOOK_URL="http://root-n8n-1:5678/webhook/lms-email-automation"
PASSWORD_RESET_EMAIL_WEBHOOK_URL="http://root-n8n-1:5678/webhook/lms-password-reset"
```

Confirm the container name first with `docker ps --format '{{.Names}}' | grep n8n`.
Going internal is what keeps these working through the next domain move. A public
n8n hostname has to actually resolve, and the `n8n.envisionchessacademy.com` this
file used to suggest never got a DNS record - anyone who copied it verbatim would
have lost every ask-coach, automation and password-reset email at the fetch.

Scheduled jobs, in the VPS crontab (`crontab -e`). These are plain HTTP calls into
this app, so they carry whatever host was current when they were written - and if
there is no crontab at all, they have never run:

```text
https://envisionchessacademy.com/api/demo/reminders
https://envisionchessacademy.com/api/fees/monthly-reminders
```

Only these two need a caller. Their logic lives in the route, so nothing else runs
them. `/api/demo/reminders` also runs the unbooked-demo follow-ups to each
salesperson, so a missing or stale entry costs the sales board its nudges with
nothing logged anywhere.

Install them through `scripts/cron-call.sh`, which reads `CRON_SECRET` and
`LMS_HOST` out of `.env` at call time. That keeps the secret out of `crontab -l`
and means the next domain change needs no crontab edit:

```cron
*/5 * * * * /opt/envision-lms/scripts/cron-call.sh /api/demo/reminders >> /var/log/lms-cron.log 2>&1
7 * * * *   /opt/envision-lms/scripts/cron-call.sh /api/fees/monthly-reminders >> /var/log/lms-cron.log 2>&1
```

The fee sweep runs hourly rather than once a day for the same reason
`monthly_attendance_summaries` does: a restart during its one daily window would
otherwise skip it silently. Re-running costs nothing - each invoice carries a
`lastReminderKey` of `<date>:<kind>`, so a given reminder goes out once per day
however often the sweep runs, and `ensureMonthlyInvoices` checks for an existing
invoice before creating one.

Everything else scheduled - ask-coach email and WhatsApp reminders, homework
reminders, class-session reminders, attendance nudges, monthly attendance
summaries, course completions, pause-expiry notices and the tournament heartbeat -
runs in-process from `src/instrumentation.ts` and needs no crontab.
`/api/ask-coach/email-reminders` and `/api/homework/reminders` accept a cron call
as an optional second safeguard over the same work; `/api/attendance/reminders` is
not a cron endpoint at all, but an in-app action fired from the attendance
workspace.

## 4. Rebuild and restart

From the LMS folder on the VPS:

```bash
bash scripts/deploy.sh
```

The deploy script checks MongoDB Atlas before rebuilding. If it prints an Atlas access-list error, open MongoDB Atlas > Security > Network Access and add the VPS outbound IP shown by the script as `/32`, then wait 1-2 minutes and run the deploy again.

If Atlas already has `0.0.0.0/0` active and the check still fails, the access list is not the blocker. Check that the VPS or hosting firewall allows outbound TCP traffic to MongoDB Atlas on port `27017`, confirm the Atlas cluster is running, and confirm the live `.env` has the correct `MONGODB_URI` username/password. The app forces MongoDB DNS resolution to IPv4 to avoid VPS IPv6 routing problems.

This rebuild is important because public browser settings such as the app URL and Razorpay key are included during the build.

## 5. Test the domain

Open:

```text
https://envisionchessacademy.com
```

Then test:

- Register
- Login
- Password reset email link
- Invoice PDF link
- Razorpay test payment
- Google Business connection, if enabled
- Android app wrapper, if you build the APK

## 6. Android app wrapper

When rebuilding the Android APK, pass the same final LMS URL:

```powershell
.\android-webview\build-apk.ps1 -AppUrl "https://envisionchessacademy.com"
```

An APK built against `classroom.` cannot be fixed from the server. `MainActivity`
pins the host it was built with and sends every other host to the system browser,
so even restoring the DNS record would land the 301 on the apex, fail `isAppHost`
and throw the user out to Chrome with no session. Those installs need a rebuilt
APK, redistributed.

## Notes

- Do not change MongoDB data for the domain move.
- Do not rotate Razorpay or Google secrets unless you want to.
- Leave `AUTH_SECRET` unchanged on the live site; changing it logs everyone out.
- Check `https://www.envisionchessacademy.com` too: it should 301 to the apex, not
  serve a second copy of the site.
- `classroom.` is out of the router rule and the `envision-canonical` regex, and
  its A record is deleted. Do not add it back to rescue an old APK - section 6
  explains why that does not work.
- DNS can take a few minutes to update, and SSL may take 30-60 seconds after Traefik sees the new domain.
