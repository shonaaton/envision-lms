# Move The LMS To The Academy Domain

The LMS domain is:

```text
https://envisionchessacademy.com
```

Use HTTPS in production, even if you type `http://` first. Traefik should issue SSL and serve the final secure URL.

The apex is canonical. `www.envisionchessacademy.com` and the legacy
`classroom.envisionchessacademy.com` are routed too and 301 to the apex, so old
links keep working but only one origin is ever served.

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

Do this even though `classroom.` still redirects. The redirect is a 301, and most
HTTP clients re-send a redirected POST as a GET with no body - so a webhook left
on the old URL will not fail loudly, it will silently deliver nothing. Every
provider below has to be repointed at the apex by hand.

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

n8n webhook URLs, if used:

```env
ASK_COACH_EMAIL_WEBHOOK_URL="https://n8n.envisionchessacademy.com/webhook/lms-email-automation"
EMAIL_AUTOMATION_WEBHOOK_URL="https://n8n.envisionchessacademy.com/webhook/lms-email-automation"
PASSWORD_RESET_EMAIL_WEBHOOK_URL="https://n8n.envisionchessacademy.com/webhook/lms-password-reset"
```

If n8n is still on a Hostinger temporary URL, keep that existing n8n URL until you move n8n too.

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

## Notes

- Do not change MongoDB data for the domain move.
- Do not rotate Razorpay or Google secrets unless you want to.
- Leave `AUTH_SECRET` unchanged on the live site; changing it logs everyone out.
- Check `https://www.envisionchessacademy.com` and
  `https://classroom.envisionchessacademy.com` too: both should 301 to the apex,
  not serve a second copy of the site.
- Once nothing points at `classroom.` any more, drop it from the router rule and
  the `envision-canonical` regex in `docker-compose.yml`, then delete its A record.
- DNS can take a few minutes to update, and SSL may take 30-60 seconds after Traefik sees the new domain.
