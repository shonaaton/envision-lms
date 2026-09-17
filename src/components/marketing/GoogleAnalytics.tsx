"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { CONSENT_EVENT, type ConsentState, readConsent } from "@/lib/cookieConsent";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * GA4 is an additional, public-site-only measurement source. It follows the
 * same analytics-consent choice as the first-party tracker, and never runs in
 * the signed-in portal.
 */
export default function GoogleAnalytics({ measurementId }: { measurementId: string }) {
  const pathname = usePathname() || "/";
  const [allowed, setAllowed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const apply = (state: ConsentState | null) => setAllowed(state?.analytics === true);
    apply(readConsent());
    const onDecision = (event: Event) => apply((event as CustomEvent<ConsentState>).detail ?? readConsent());
    window.addEventListener(CONSENT_EVENT, onDecision);
    return () => window.removeEventListener(CONSENT_EVENT, onDecision);
  }, []);

  useEffect(() => {
    if (!allowed || !ready || !window.gtag) return;
    window.gtag("event", "page_view", { page_path: pathname });
  }, [allowed, pathname, ready]);

  if (!allowed || !measurementId) return null;

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`} strategy="afterInteractive" onReady={() => setReady(true)} />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){window.dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${measurementId}', { send_page_view: false });
        `}
      </Script>
    </>
  );
}
