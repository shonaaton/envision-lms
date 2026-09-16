function normalizeExternalUrl(value?: string | null) {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    return new URL(withProtocol).origin;
  } catch {
    return "";
  }
}

/**
 * The public origin the marketing pages are served from.
 *
 * The apex is canonical: Traefik 301s `www.` to it, so every absolute URL the
 * app emits - canonicals, sitemap entries, JSON-LD - names the same origin a
 * crawler will land on.
 */
export const MARKETING_BASE_URL =
  normalizeExternalUrl(process.env.NEXT_PUBLIC_MARKETING_URL) ||
  "https://envisionchessacademy.com";

/**
 * The legal pages are routes of this app, not of a separate marketing site, so
 * these stay relative. Absolute URLs to the old WordPress slugs would now point
 * back at this same origin and loop.
 */
export const LEGAL_LINKS = {
  privacy: "/privacy",
  terms: "/terms",
  refund: "/refund-policy",
};

export const OFFLINE_ACADEMY_URL = `${MARKETING_BASE_URL}/chess-academy-in-kolkata`;
