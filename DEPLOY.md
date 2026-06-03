# Deploy Envision Chess Academy LMS

You've got everything ready. Three steps remain — all of them require access I don't have
(your VPS, your Mongo Atlas cluster, your Razorpay account), so I'm leaving copy-paste
commands for you here.

---

## Step 1 — On your laptop: push the project to a git repo

So the VPS can `git clone` it. Github / Gitlab / your own Gitea — any will do.

```bash
cd "C:\Users\User\LMS PRoject\Experimentating to create an LMS\lms"
git init
git add .
git commit -m "Initial Envision Chess Academy LMS"
git branch -M main
git remote add origin git@github.com:<your-user>/envision-lms.git   # ← change
git push -u origin main
```

If you'd rather skip git, you can `scp -r lms/ user@vps:/opt/envision-lms` — same result.

---

## Step 2 — On your Hostinger VPS: deploy

SSH in (`ssh root@<vps-ip>`) and:

```bash
# 1) Pull the code
git clone git@github.com:<your-user>/envision-lms.git /opt/envision-lms
cd /opt/envision-lms

# 2) Fill in environment
cp .env.example .env
nano .env
#   MONGODB_URI       = mongodb+srv://...     (from your Atlas cluster)
#   AUTH_SECRET       = $(openssl rand -base64 32)
#   NEXTAUTH_URL      = https://platform.envisionchessacademy.com
#   RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET
#   NEXT_PUBLIC_RAZORPAY_KEY_ID = (same as RAZORPAY_KEY_ID)

# 3) DNS — point your domain to the VPS
#    A record:   platform.envisionchessacademy.com   →  <your-vps-ip>

# 4) Run the one-shot deploy
bash scripts/deploy.sh
```

`deploy.sh` does:
- pulls Stockfish.js into `/public/stockfish/`
- ensures the shared `web` Docker network exists (so Traefik + n8n can see this app)
- runs `docker compose up -d --build`
- tails 15s of logs so you can confirm the app booted

After Traefik picks it up (~30–60s) it'll issue a Let's Encrypt cert automatically.
Visit https://platform.envisionchessacademy.com — you should see the landing page.

---

## Step 3 — Promote your account to admin

Register on the deployed site first (visit /register, sign up normally). Then make
yourself admin one of two ways:

**Easiest — Atlas UI:**
1. Open cloud.mongodb.com → your cluster → Browse Collections
2. Pick database `envision_chess` → collection `users`
3. Find your user → edit → set `role: "admin"` → save

**Or from anywhere with `node`:**
```bash
MONGODB_URI="mongodb+srv://..." node scripts/promote-admin.js you@example.com
```

---

## Step 4 — Razorpay webhook (one minute, do this last)

1. Razorpay dashboard → Settings → Webhooks → Add
2. URL: `https://platform.envisionchessacademy.com/api/payments/webhook`
3. Secret: same string you put in `RAZORPAY_WEBHOOK_SECRET`
4. Events: `payment.captured` and `payment.failed`

---

## Hooking into your n8n (bonus)

Both this LMS and n8n now live on the same VPS, same docker network. From inside
the LMS container you can hit `http://n8n:5678/webhook/<path>` to fire workflows
on every enrollment, booking, attendance mark, etc. Drop this into `.env`:

```
N8N_WEBHOOK_BASE=http://n8n:5678/webhook
```

…then call it from any API route, e.g. in `src/app/api/payments/verify/route.ts`
after the enrollment update:

```ts
if (process.env.N8N_WEBHOOK_BASE) {
  await fetch(`${process.env.N8N_WEBHOOK_BASE}/student-enrolled`, {
    method: "POST",
    body: JSON.stringify({ userId: pay.user, classroomId: pay.refId }),
  });
}
```

Your n8n flow can then fire WhatsApp/email/Discord notifications without touching
this codebase again.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `docker compose` says network `web` not found | `docker network create web` then retry |
| Traefik returns 404 | Check labels in `docker-compose.yml` match your Traefik entrypoint name (`websecure`) and resolver name (`letsencrypt`) — yours may differ |
| MongoDB `MongoServerSelectionError` | Add the VPS IP to Atlas Network Access allowlist (Atlas → Network Access) |
| Razorpay checkout shows "key id missing" | `NEXT_PUBLIC_RAZORPAY_KEY_ID` must be set at **build time** — re-run `docker compose up -d --build` after editing `.env` |
| Analysis board "engine: —" | `scripts/setup-assets.sh` didn't fetch Stockfish. Run it manually |
