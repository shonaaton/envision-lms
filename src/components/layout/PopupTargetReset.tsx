"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** One reset per stale pop-up and URL within this window; see the loop note below. */
const REPEAT_GUARD_MS = 3_000;

/**
 * Closes a `HashPopup` that the URL no longer points at.
 *
 * Those popups open on CSS `:target`. A form inside one submits a server action
 * that redirects back to the page (`?ok=...` or `?error=...`), and Next.js
 * applies that redirect with `history.pushState` - which browsers do not treat
 * as a fragment navigation, so `:target` keeps matching the old popup. The save
 * succeeded and the notice rendered, but the popup stayed open on top of it.
 *
 * Only a real fragment navigation re-evaluates `:target`, so this makes one to
 * "#" (replacing the current entry, so Back is not affected) and then restores
 * the clean URL along with the router's history state.
 *
 * Loop guard: iOS Safari can keep `:target` matching after the reset, and this
 * effect runs on every render, so on 14 Nov 2026 a student's dashboard called
 * replaceState more than 100 times in 10 seconds until Safari refused and the
 * Next router crashed ("null is not an object (evaluating 't.parallelRoutes.get')").
 * The same pop-up on the same URL is now reset once per few seconds at most.
 */
export default function PopupTargetReset() {
  const pathname = usePathname();
  const search = useSearchParams()?.toString() ?? "";
  const lastReset = useRef<{ key: string; at: number }>({ key: "", at: 0 });

  // No dependency list on purpose: a repeat of the same outcome (the same error
  // twice) redirects to an identical URL, and the re-render it causes is the
  // only signal. The check is a single selector lookup when nothing is stale.
  useEffect(() => {
    const target = document.querySelector(":target");
    if (!target) return;
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (hash && target.id === hash) return;

    const url = `${window.location.pathname}${window.location.search}`;
    const key = `${target.id}|${url}`;
    const now = Date.now();
    if (lastReset.current.key === key && now - lastReset.current.at < REPEAT_GUARD_MS) return;
    lastReset.current = { key, at: now };

    const state = window.history.state;
    try {
      window.location.replace("#");
      window.history.replaceState(state, "", url);
    } catch {
      // Safari throws SecurityError once its replaceState budget is spent; a
      // stale pop-up is better than a crashed page.
    }
  });

  void pathname;
  void search;
  return null;
}
