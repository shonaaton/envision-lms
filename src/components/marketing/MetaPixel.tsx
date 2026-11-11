"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CONSENT_EVENT, type ConsentState, readConsent } from "@/lib/cookieConsent";
import { isCampaignPixelPath, trackMetaPageView } from "@/lib/metaPixel";

/**
 * Sends the Meta page view for a free demo campaign page, and does nothing on
 * any other page: `lib/metaPixel` loads Meta's script only there, and only
 * once marketing consent exists.
 *
 * It listens for the consent decision so that a visitor who accepts on the
 * landing page is counted on that page, not only from the next one.
 *
 * There is deliberately no `<noscript>` pixel: that fires on render with no way
 * to ask first, which is the thing the consent check exists to prevent.
 */
export default function MetaPixel() {
  const pathname = usePathname();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const apply = (state: ConsentState | null) => setAllowed(state?.marketing === true);
    apply(readConsent());
    const onDecision = (event: Event) => apply((event as CustomEvent<ConsentState>).detail ?? readConsent());
    window.addEventListener(CONSENT_EVENT, onDecision);
    return () => window.removeEventListener(CONSENT_EVENT, onDecision);
  }, []);

  useEffect(() => {
    if (allowed && isCampaignPixelPath(pathname)) trackMetaPageView();
  }, [allowed, pathname]);

  return null;
}
