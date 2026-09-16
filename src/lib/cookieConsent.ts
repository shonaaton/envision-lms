/**
 * Cookie consent: the purposes, and how a decision is stored.
 *
 * The decision lives in a first-party cookie rather than only in localStorage,
 * so server components and middleware can read it on the first request instead
 * of waiting for hydration. A localStorage mirror is kept purely so the banner
 * can decide whether to show itself before the cookie is parsed.
 *
 * "necessary" is always on and is not a choice: it covers the session cookie
 * that keeps a student logged in, and the consent record itself.
 */

export const CONSENT_COOKIE = "envision_cookie_consent";
export const CONSENT_STORAGE_KEY = "envision.cookieConsent";

/** Bump when the purposes change, so a stale decision is re-asked. */
export const CONSENT_VERSION = 1;

/** A year: long enough not to nag, short enough to be a fresh decision. */
export const CONSENT_MAX_AGE_DAYS = 365;

export type ConsentCategory = "necessary" | "analytics" | "marketing";

export type ConsentState = {
  version: number;
  /** ISO timestamp of the decision, so the record is auditable. */
  decidedAt: string;
  necessary: true;
  analytics: boolean;
  marketing: boolean;
};

export type CookiePurpose = {
  id: ConsentCategory;
  title: string;
  detail: string;
  /** What actually runs when this is on. Vague purposes are not consent. */
  examples: string;
  locked?: boolean;
};

export const cookiePurposes: CookiePurpose[] = [
  {
    id: "necessary",
    title: "Strictly necessary",
    detail:
      "Required for the site to work. These keep you signed in to the student portal, keep your session secure, and remember this cookie choice. They cannot be switched off.",
    examples: "Sign-in session, security tokens, this consent record.",
    locked: true,
  },
  {
    id: "analytics",
    title: "Analytics and performance",
    detail:
      "Helps us understand which pages are used and where people get stuck, so the site and the portal can be improved. Measurement only - never used to target advertising.",
    examples: "Aggregate page and feature usage.",
  },
  {
    id: "marketing",
    title: "Marketing",
    detail:
      "Lets us measure which adverts lead to demo bookings, and show our courses to people who have visited before. Turning this off does not reduce what you can do on the site.",
    examples: "Meta (Facebook) Pixel, conversion measurement, remarketing audiences.",
  },
];

export const consentAllOn = (): ConsentState => ({
  version: CONSENT_VERSION,
  decidedAt: new Date().toISOString(),
  necessary: true,
  analytics: true,
  marketing: true,
});

export const consentEssentialOnly = (): ConsentState => ({
  version: CONSENT_VERSION,
  decidedAt: new Date().toISOString(),
  necessary: true,
  analytics: false,
  marketing: false,
});

/** Parses a stored decision, returning null when absent, malformed or stale. */
export function parseConsent(raw: string | undefined | null): ConsentState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.version !== CONSENT_VERSION) return null;
    return {
      version: CONSENT_VERSION,
      decidedAt: typeof parsed.decidedAt === "string" ? parsed.decidedAt : new Date().toISOString(),
      necessary: true,
      analytics: parsed.analytics === true,
      marketing: parsed.marketing === true,
    };
  } catch {
    return null;
  }
}

/** Reads the decision in the browser, preferring the cookie. */
export function readConsent(): ConsentState | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((row) => row.startsWith(`${CONSENT_COOKIE}=`));
  const fromCookie = parseConsent(match?.slice(CONSENT_COOKIE.length + 1));
  if (fromCookie) return fromCookie;
  try {
    return parseConsent(window.localStorage.getItem(CONSENT_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Writes the decision to both the cookie and the localStorage mirror. */
export function writeConsent(state: ConsentState) {
  if (typeof document === "undefined") return;
  const value = encodeURIComponent(JSON.stringify(state));
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${value}; Path=/; Max-Age=${CONSENT_MAX_AGE_DAYS * 24 * 60 * 60}; SameSite=Lax${secure}`;
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private windows and blocked storage: the cookie is the source of truth.
  }
}

/** Fired whenever a decision is made, so listeners can react without a reload. */
export const CONSENT_EVENT = "envision:cookie-consent";
