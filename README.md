# Envision Chess Academy — LMS

A Next.js 14 + MongoDB Atlas chess academy LMS with classrooms, homework with chess
positions, PGN library, analysis board, Stockfish play-vs-computer, self-booking,
attendance, and Razorpay fee collection. Built to deploy alongside n8n on a single
Hostinger VPS.

## Stack

- Next.js 14 (App Router) + TypeScript
- MongoDB Atlas + Mongoose
- NextAuth.js v5 (credentials) — student / instructor / admin roles
- chess.js + react-chessboard + Stockfish.js (engine optional)
- Razorpay (orders + webhook)
- Tailwind CSS (brand `#5a1372` purple / `#fde75a` yellow)
- Dockerized, drops into a Traefik or Caddy reverse-proxy stack

## Quick start (local)

```bash
cp .env.example .env
# fill MONGODB_URI, AUTH_SECRET (openssl rand -base64 32), Razorpay test keys
npm install
npm run dev
```

Open http://localhost:3000

## Stockfish (optional)

The Analysis Board and Play vs Computer look for an engine at
`/public/stockfish/stockfish.js`. Drop the WASM build of
[Stockfish.js](https://github.com/lichess-org/stockfish.js) there. Without it the
chessboards still work, just no engine evaluation.

## Branding

Drop your real logo PNGs into `/public`:

- `/public/logo-purple.png`
- `/public/logo-yellow.png`

The placeholder SVG at `/public/logo.svg` will be replaced by Next/Image when these
files are present. Update `tailwind.config.ts` `brand` and `accent` palettes to
change colors.

## Deploy on Hostinger VPS (alongside n8n)

Assumes you already have:

- A Hostinger KVM VPS with Docker + Docker Compose
- n8n running behind Traefik (or Caddy) with an external Docker network named `web`
- DNS `www.classroom.envisionchessacademy.com` pointing at the VPS

Then:

```bash
# on the VPS
git clone <your-repo> /opt/envision-lms
cd /opt/envision-lms/lms
cp .env.example .env
nano .env   # fill Mongo, AUTH_SECRET, Razorpay keys
docker compose up -d --build
```

Traefik picks up the labels in `docker-compose.yml` and routes the `LMS_HOST`
domain from `.env` to the container on port 3000, with automatic Let's Encrypt TLS.

Tournament Arena realtime play uses Socket.IO over WebSocket only. Deploy the app as
the included standalone Node server or another long-running Node process. Do not use
a serverless-only target for playable tournaments, because serverless functions do
not reliably keep WebSocket rooms, presence, and live board updates alive.

If you use Caddy instead of Traefik, drop these lines in your `Caddyfile`:

```
www.classroom.envisionchessacademy.com {
  reverse_proxy envision-lms:3000
}
```

## Folder layout

```
lms/
├── src/
│   ├── app/                       # Next.js routes (App Router)
│   │   ├── (auth)/                # /login, /register
│   │   ├── (dashboard)/           # protected — /dashboard, /classrooms, ...
│   │   └── api/                   # /api/auth, /api/classrooms, /api/payments, ...
│   ├── components/                # Sidebar, Topbar, chess boards, PayButton, ...
│   ├── lib/                       # db, auth, validation, razorpay
│   ├── models/                    # Mongoose schemas
│   └── middleware.ts              # role-based route guards
├── public/                        # logo, stockfish engine
├── Dockerfile
├── docker-compose.yml
└── README.md
```

## Roles

- **student** — sees dashboard, own classrooms, homework, fees, bookings, PGN
- **instructor** — adds classrooms, assigns homework, marks attendance, manages availability
- **admin** — everything + `/admin/users`, announcements, settings

To make an admin: register a user normally, then in MongoDB Atlas update
`db.users.updateOne({ email: "you@x.com" }, { $set: { role: "admin" } })`.

## What's wired up

- [x] Auth (credentials + JWT sessions + role middleware)
- [x] Classrooms (create / list / view, role-aware)
- [x] Homework with chess puzzles (instructor assigns, student solves on board)
- [x] Submission grading (auto by SAN match)
- [x] Attendance (instructor marks per-session)
- [x] Self-booking (with Availability) + collision check
- [x] PGN Library (upload, parse headers, replay viewer)
- [x] Analysis Board (chess.js + Stockfish UCI)
- [x] Play vs Computer (Stockfish depth-N)
- [x] Razorpay orders + checkout verify + webhook
- [x] Fees page + Invoices page (server-rendered)
- [x] Brand-styled dashboard shell matching the Envision sidebar map

## What's next (good v2 candidates)

- Tournaments + Simuls (Swiss pairing, round management)
- Real-time PvP via WebSockets (or embed Lichess study)
- Announcements + push notifications
- Per-classroom Lichess study link sync
- Invoice PDF generation (use the `pdf` skill)
- Email notifications via n8n webhooks 👈 use your existing n8n!

## Tying into your n8n

Drop your n8n base URL in `.env` and call it from inside the app where helpful:

```ts
await fetch(`${process.env.N8N_WEBHOOK_URL}/student-enrolled`, {
  method: "POST",
  body: JSON.stringify({ userId, classroomId }),
});
```

n8n can then send WhatsApp / email / Discord notifications, sync to Sheets, etc.

---

Built for Sayantan @ Envision Chess Academy.
