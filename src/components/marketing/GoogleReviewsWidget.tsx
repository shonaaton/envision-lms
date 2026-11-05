"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";

/** The academy's Elfsight "Google Reviews" app; its layout and filters are set in the Elfsight dashboard. */
const ELFSIGHT_REVIEWS_APP = "elfsight-app-9ec50423-db91-4f0a-a316-526f636f023c";
const HIDE_TITLE_STYLE_ID = "envision-hide-widget-title";

/**
 * Google reviews, rendered by Elfsight from the academy's listing. Used on the
 * homepage and /book-free-demo-class. `data-elfsight-app-lazy` defers the
 * widget until it scrolls near the viewport, and the platform script loads
 * after the page is idle, so neither costs the first paint anything.
 *
 * `hideTitle` drops the widget's own "What Our Customers Say" heading. Elfsight
 * renders inside a shadow root, which page CSS cannot reach, so the rule goes
 * into the root itself as soon as it appears. If Elfsight renames the class the
 * title simply comes back; nothing else breaks.
 */
export default function GoogleReviewsWidget({
  className = "",
  hideTitle = false,
}: {
  className?: string;
  hideTitle?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!hideTitle || !host) return;

    let rootObserver: MutationObserver | null = null;
    const apply = () => {
      const root = host.querySelector(".es-embed-root")?.shadowRoot;
      if (!root) return;
      if (!root.getElementById(HIDE_TITLE_STYLE_ID)) {
        const style = document.createElement("style");
        style.id = HIDE_TITLE_STYLE_ID;
        style.textContent = ".es-widget-title-container{display:none!important}";
        root.append(style);
      }
      if (!rootObserver) {
        rootObserver = new MutationObserver(apply);
        rootObserver.observe(root, { childList: true });
      }
    };

    const hostObserver = new MutationObserver(apply);
    hostObserver.observe(host, { childList: true, subtree: true });
    apply();

    return () => {
      hostObserver.disconnect();
      rootObserver?.disconnect();
    };
  }, [hideTitle]);

  return (
    <>
      <div ref={hostRef}>
        <div className={`${ELFSIGHT_REVIEWS_APP} ${className}`.trim()} data-elfsight-app-lazy="" />
      </div>
      <Script src="https://elfsightcdn.com/platform.js" strategy="lazyOnload" />
    </>
  );
}
