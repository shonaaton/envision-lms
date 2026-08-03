# Move The LMS To The Classroom Domain

The LMS domain is:

```text
https://classroom.envisionchessacademy.com
```

Use HTTPS in production, even if you type `http://` first. Traefik should issue SSL and serve the final secure URL.

## 1. Point DNS to the VPS

In your domain DNS panel, add this record:

```text
Type: A
Name: classroom
Value: <your-vps-ip-address>
TTL: Automatic or 300
```

If your DNS panel asks for the full host instead of just the name, enter:

```text
classroom.envisionchessacademy.com
```

## 2. Update `.env` on the VPS

On the VPS, open the live `.env` file and set:

```env
LMS_HOST="classroom.envisionchessacademy.com"
NEXTAUTH_URL="https://classroom.envisionchessacademy.com"
NEXT_PUBLIC_APP_URL="https://classroom.envisionchessacademy.com"

NEXT_PUBLIC_MARKETING_URL="https://www.envisionchessacademy.com"
NEXT_PUBLIC_POLICY_BASE_URL="https://www.envisionchessacademy.com"
```

Keep your existing MongoDB, Razorpay, WhatsApp, and `AUTH_SECRET` values unchanged.

## 3. Update connected services

Razorpay webhook:

```text
https://classroom.envisionchessacademy.com/api/payments/webhook
```

Google Business callback:

```text
https://classroom.envisionchessacademy.com/api/auth/google-business/callback
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

This rebuild is important because public browser settings such as the app URL and Razorpay key are included during the build.

## 5. Test the domain

Open:

```text
https://classroom.envisionchessacademy.com
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
.\android-webview\build-apk.ps1 -AppUrl "https://classroom.envisionchessacademy.com"
```

## Notes

- Do not change MongoDB data for the domain move.
- Do not rotate Razorpay or Google secrets unless you want to.
- Leave `AUTH_SECRET` unchanged on the live site; changing it logs everyone out.
- DNS can take a few minutes to update, and SSL may take 30-60 seconds after Traefik sees the new domain.
