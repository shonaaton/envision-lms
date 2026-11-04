import Script from "next/script";

/** The academy's Elfsight "Google Reviews" app; its layout and filters are set in the Elfsight dashboard. */
const ELFSIGHT_REVIEWS_APP = "elfsight-app-9ec50423-db91-4f0a-a316-526f636f023c";

/**
 * Google reviews, rendered by Elfsight from the academy's listing. Used on the
 * homepage and /book-free-demo-class. `data-elfsight-app-lazy` defers the
 * widget until it scrolls near the viewport, and the platform script loads
 * after the page is idle, so neither costs the first paint anything.
 */
export default function GoogleReviewsWidget({ className = "" }: { className?: string }) {
  return (
    <>
      <div className={`${ELFSIGHT_REVIEWS_APP} ${className}`.trim()} data-elfsight-app-lazy="" />
      <Script src="https://elfsightcdn.com/platform.js" strategy="lazyOnload" />
    </>
  );
}
