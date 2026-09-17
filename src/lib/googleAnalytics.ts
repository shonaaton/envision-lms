/** Browser-safe GA4 helpers. Values here must never contain visitor-provided data. */

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function publicPageType(pathname: string) {
  if (pathname === "/") return "home";
  if (pathname === "/register") return "demo_registration";
  if (pathname.startsWith("/contact-us")) return "contact";
  if (pathname.startsWith("/chess-academy-in-")) return "location_landing";
  if (pathname.startsWith("/courses")) return "course_landing";
  if (pathname.startsWith("/success-stories")) return "success_stories";
  if (["/privacy", "/terms", "/refund-policy"].some((path) => pathname.startsWith(path))) return "legal";
  return "marketing_page";
}

export function trackGoogleAnalyticsEvent(event: string, parameters: Record<string, string | number | boolean | undefined> = {}) {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", event, parameters);
}
