"use client";

/**
 * The server's time as seen from the browser.
 *
 * The Join button used to compare the class start with `new Date()` - the
 * device clock. A phone or tablet running a few minutes slow kept Join greyed
 * out after the room had opened (reloading did nothing; it only opened once
 * enough real time had passed), and one running fast enabled Join early, so the
 * click bounced off the server with `join_window_closed`. Both showed up in
 * production. The offset is measured once per page (half the round trip is
 * credited to the network) and re-measured when the tab comes back to the
 * front, since a phone may correct its clock while the page sleeps.
 */
let offsetMs = 0;
let measuredAt = 0;
let request: Promise<number> | null = null;

const RESYNC_AFTER_MS = 60_000;

export function serverNow() {
  return new Date(Date.now() + offsetMs);
}

export function syncServerClock(force = false): Promise<number> {
  if (!force && measuredAt && Date.now() - measuredAt < RESYNC_AFTER_MS) return Promise.resolve(offsetMs);
  if (!request) {
    const sentAt = Date.now();
    request = fetch("/api/time", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { now?: number } | null) => {
        const receivedAt = Date.now();
        const server = Number(payload?.now);
        // A very slow reply says little about the clock; keep the last offset.
        if (Number.isFinite(server) && receivedAt - sentAt < 10_000) {
          offsetMs = server + (receivedAt - sentAt) / 2 - receivedAt;
          measuredAt = receivedAt;
        }
        return offsetMs;
      })
      .catch(() => offsetMs)
      .finally(() => {
        request = null;
      });
  }
  return request;
}
