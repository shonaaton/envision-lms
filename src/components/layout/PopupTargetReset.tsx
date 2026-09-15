"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

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
 */
export default function PopupTargetReset() {
  const pathname = usePathname();
  const search = useSearchParams()?.toString() ?? "";

  // No dependency list on purpose: a repeat of the same outcome (the same error
  // twice) redirects to an identical URL, and the re-render it causes is the
  // only signal. The check is a single selector lookup when nothing is stale.
  useEffect(() => {
    const target = document.querySelector(":target");
    if (!target) return;
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (hash && target.id === hash) return;

    const state = window.history.state;
    const url = `${window.location.pathname}${window.location.search}`;
    window.location.replace("#");
    window.history.replaceState(state, "", url);
  });

  void pathname;
  void search;
  return null;
}
