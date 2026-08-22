# Shared Engine Coordinator

The LMS exposes one engine API for Play vs Computer, the Analysis Board, classroom analysis, PGN jobs, and tournament test bots. Jobs are persisted in MongoDB and workers use the Fishnet pull protocol.

## Start a worker

Set `ENGINE_FISHNET_WORKERS` in the server environment using comma-separated entries:

```text
fishnet-01:<long-random-secret>:2:Fishnet-01,fishnet-02:<long-random-secret>:2:Fishnet-02
```

Point each private Fishnet worker at the LMS origin with the `/fishnet` path and its individual key. Worker secrets are hashed before a worker record is stored. Do not commit real keys.

## API flow

1. An authenticated LMS client posts to `/v1/engine/move`, `/v1/engine/analyse`, or `/v1/engine/pgn`.
2. The coordinator validates the chess input, deduplicates active work, and persists a queued job.
3. A Fishnet worker polls `/fishnet/acquire`, receives the highest-priority job, and posts its result to the matching move or analysis route.
4. Clients poll `/v1/engine/jobs/:id` until the job is completed, failed, or cancelled.

`GET /health` and `GET /fishnet/status` expose Mongo, queue, and worker health.

## Current deployment boundary

The first implementation keeps the live queue and short-lived result cache in the Next.js process and persists job state in MongoDB. It is safe for a single app instance with workers, but it is not yet safe to scale the LMS horizontally. Before running multiple app instances, replace the queue state in `src/lib/engine/service.ts` with Redis-backed queue, lease, and cache operations.
