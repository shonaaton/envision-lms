# ---- deps: install all deps (including dev — needed for next build) ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --legacy-peer-deps

# ---- build ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# The type check + lint step outgrew Node's default ~2 GB heap (2026-11-24).
# When it runs out, Next 14.2 still exits 0 and leaves no .next/standalone, so
# the runner stage fails with a confusing "not found". The VPS has 8 GB.
ENV NODE_OPTIONS=--max-old-space-size=4096
# Fail here, with a clear message, if the build did not really finish.
RUN npm run build && test -f .next/standalone/server.js || (echo "next build did not produce .next/standalone/server.js - check the build output above (out of memory?)" && exit 1)

# ---- runtime (standalone Next.js output) ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# The uploads volume (docker-compose.yml) takes this folder's owner when first
# created, so the server user can write to it.
RUN mkdir -p /app/data/uploads && chown -R nextjs:nodejs /app/data
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
