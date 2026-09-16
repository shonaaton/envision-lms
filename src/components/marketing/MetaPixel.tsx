"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { CONSENT_EVENT, type ConsentState, readConsent } from "@/lib/cookieConsent";

/**
 * Loads the Meta Pixel, but only once marketing consent exists.
 *
 * Until then `window.fbq` is simply undefined, and every helper in
 * `lib/metaPixel` already returns early when it is - so the rest of the app
 * needs no consent checks of its own.
 *
 * There is deliberately no `<noscript>` pixel: that fires on render with no way
 * to ask first, which is the thing this component exists to prevent.
 */
export default function MetaPixel({ pixelId }: { pixelId: string }) {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const apply = (state: ConsentState | null) => setAllowed(state?.marketing === true);
    apply(readConsent());
    const onDecision = (event: Event) => apply((event as CustomEvent<ConsentState>).detail ?? readConsent());
    window.addEventListener(CONSENT_EVENT, onDecision);
    return () => window.removeEventListener(CONSENT_EVENT, onDecision);
  }, []);

  if (!allowed || !pixelId) return null;

  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {`
        !function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)}(window, document,'script',
        'https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', '${pixelId}');
        fbq('track', 'PageView');
      `}
    </Script>
  );
}
