"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { readConsent } from "@/lib/cookieConsent";
import { flushPageDuration, onConsentChange, trackClick, trackPageView } from "@/lib/siteAnalytics";

/**
 * Records page views, time on page and contact clicks, once analytics consent
 * exists.
 *
 * A page view is opened on arrival and written when the visitor leaves, so the
 * row carries a duration - that is what makes time-on-page, bounce rate and exit
 * rate answerable rather than guessed.
 *
 * Clicks are caught by one delegated listener instead of wiring every link, so
 * nothing has to be remembered when new buttons are added.
 */
export default function SiteAnalyticsTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    setAllowed(readConsent()?.analytics === true);
    return onConsentChange((state) => {
      const next = state?.analytics === true;
      setAllowed(next);
      // Consent withdrawn mid-visit: drop the open page rather than sending it.
      if (!next) flushPageDuration();
    });
  }, []);

  // `searchParams` is in the key so a UTM-tagged landing is captured, but only
  // the pathname is ever sent.
  const routeKey = `${pathname || ""}?${searchParams?.toString() || ""}`;

  useEffect(() => {
    if (!allowed || !pathname) return;
    trackPageView(pathname);
  }, [allowed, pathname, routeKey]);

  // The last page of a visit is only recorded if we catch the page going away.
  useEffect(() => {
    if (!allowed) return;
    const flush = () => flushPageDuration();
    const onHidden = () => {
      if (document.visibilityState === "hidden") flushPageDuration();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [allowed]);

  // One delegated click listener for contact taps, demo CTAs and outbound links.
  useEffect(() => {
    if (!allowed) return;
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest?.("a,button");
      if (!anchor) return;
      const label = (anchor.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80);
      const href = anchor instanceof HTMLAnchorElement ? anchor.getAttribute("href") || "" : "";

      if (href.startsWith("tel:") || href.startsWith("mailto:") || href.startsWith("https://wa.me")) {
        trackClick("contact", label || href.split(":")[0]);
        return;
      }
      if (href === "/register" || /demo|book|assessment/i.test(label)) {
        trackClick("cta", label || "Demo CTA");
        return;
      }
      if (href.startsWith("http") && !href.includes(window.location.host)) {
        try {
          trackClick("outbound", new URL(href).host);
        } catch {
          // Malformed href: not worth recording.
        }
      }
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [allowed]);

  return null;
}
