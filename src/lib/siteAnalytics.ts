"use client";

import { CONSENT_EVENT, type ConsentState, readConsent } from "@/lib/cookieConsent";

/**
 * The browser half of first-party analytics.
 *
 * Everything here is a no-op unless the visitor turned analytics on.
 *
 * Two ids are kept, and the difference matters: `sessionId` lives in
 * `sessionStorage` and dies with the tab, while `visitorId` lives in
 * `localStorage` so "new vs returning" is answerable. Both are random and
 * meaningless on their own - neither is derived from anything about the person.
 */

const SESSION_KEY = "envision.analyticsSession";
const VISITOR_KEY = "envision.analyticsVisitor";
const LANDING_KEY = "envision.analyticsLanding";
const UTM_KEY = "envision.analyticsUtm";
const INDEX_KEY = "envision.analyticsPageIndex";
const ENDPOINT = "/api/analytics/collect";

export type UtmSet = {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmTerm: string;
  utmContent: string;
};

const EMPTY_UTM: UtmSet = { utmSource: "", utmMedium: "", utmCampaign: "", utmTerm: "", utmContent: "" };

export function analyticsAllowed(): boolean {
  return readConsent()?.analytics === true;
}

function randomId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function session(): string {
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = randomId("s");
    window.sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return "";
  }
}

/** Returns the persistent id and whether this is the visitor's first ever visit. */
function visitor(): { visitorId: string; isNew: boolean } {
  try {
    const existing = window.localStorage.getItem(VISITOR_KEY);
    if (existing) return { visitorId: existing, isNew: false };
    const id = randomId("v");
    window.localStorage.setItem(VISITOR_KEY, id);
    return { visitorId: id, isNew: true };
  } catch {
    // Blocked storage: still countable as a session, just never as returning.
    return { visitorId: "", isNew: true };
  }
}

function device(): "mobile" | "tablet" | "desktop" {
  const width = window.innerWidth;
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

/** Referrers are reduced to a host; internal ones are treated as direct. */
function referrerHost(): string {
  try {
    if (!document.referrer) return "";
    const url = new URL(document.referrer);
    if (url.host === window.location.host) return "";
    return url.host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * The campaign that started the visit, remembered for the whole session so a
 * conversion three pages later is still credited to it.
 */
function campaign(): UtmSet {
  try {
    const stored = window.sessionStorage.getItem(UTM_KEY);
    if (stored) return { ...EMPTY_UTM, ...JSON.parse(stored) };
  } catch {
    // fall through and read the URL
  }
  const params = new URLSearchParams(window.location.search);
  const found: UtmSet = {
    utmSource: params.get("utm_source") || "",
    utmMedium: params.get("utm_medium") || "",
    utmCampaign: params.get("utm_campaign") || "",
    utmTerm: params.get("utm_term") || "",
    utmContent: params.get("utm_content") || "",
  };
  if (Object.values(found).some(Boolean)) {
    try {
      window.sessionStorage.setItem(UTM_KEY, JSON.stringify(found));
    } catch {
      // Non-fatal: the campaign is simply not remembered past this page.
    }
  }
  return found;
}

function landingPath(currentPath: string): string {
  try {
    const stored = window.sessionStorage.getItem(LANDING_KEY);
    if (stored) return stored;
    window.sessionStorage.setItem(LANDING_KEY, currentPath);
    return currentPath;
  } catch {
    return currentPath;
  }
}

function nextPageIndex(): number {
  try {
    const next = Number(window.sessionStorage.getItem(INDEX_KEY) || "0") + 1;
    window.sessionStorage.setItem(INDEX_KEY, String(next));
    return next;
  } catch {
    return 1;
  }
}

function base(path: string) {
  const { visitorId, isNew } = visitor();
  return {
    path,
    landingPath: landingPath(path),
    referrerHost: referrerHost(),
    device: device(),
    sessionId: session(),
    visitorId,
    isNewVisitor: isNew,
    ...campaign(),
  };
}

function send(body: Record<string, unknown>) {
  const payload = JSON.stringify(body);
  try {
    // `sendBeacon` survives the page being closed mid-navigation, which is how
    // the final page's time-on-page gets recorded at all.
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: "application/json" }));
      return;
    }
  } catch {
    // fall through to fetch
  }
  void fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(() => null);
}

/* ---------------------------------------------------------------- page views */

let openPage: { path: string; startedAt: number; index: number } | null = null;

/** Sends the time spent on the page we are leaving, if any. */
export function flushPageDuration() {
  if (!openPage || !analyticsAllowed()) {
    openPage = null;
    return;
  }
  const durationMs = Math.min(Date.now() - openPage.startedAt, 30 * 60 * 1000);
  const closing = openPage;
  openPage = null;
  if (durationMs < 250) return;
  send({ type: "pageview", ...base(closing.path), pageIndex: closing.index, durationMs });
}

/**
 * Opens a page view. The row is written when the page is left, so it carries a
 * duration - which is what makes time-on-page and exit rate answerable.
 */
export function trackPageView(path: string) {
  if (typeof window === "undefined" || !analyticsAllowed()) return;
  flushPageDuration();
  if (!session()) return;
  openPage = { path, startedAt: Date.now(), index: nextPageIndex() };
}

/* -------------------------------------------------------------- conversions */

/** A demo registration or booking, credited to the session's campaign. */
export function trackConversion(conversionType: string) {
  if (typeof window === "undefined" || !analyticsAllowed()) return;
  if (!session()) return;
  send({ type: "conversion", conversionType, ...base(window.location.pathname), pageIndex: openPage?.index || 0 });
}

/* -------------------------------------------------------------------- clicks */

export type ClickType = "contact" | "cta" | "outbound";

/** A tracked interaction: phone/email taps, demo buttons, outbound links. */
export function trackClick(clickType: ClickType, label: string) {
  if (typeof window === "undefined" || !analyticsAllowed()) return;
  if (!session()) return;
  send({
    type: "click",
    clickType,
    clickLabel: label.slice(0, 80),
    ...base(window.location.pathname),
    pageIndex: openPage?.index || 0,
  });
}

/** Lets a component re-check permission when the visitor changes their mind. */
export function onConsentChange(handler: (state: ConsentState | null) => void) {
  const listener = (event: Event) => handler((event as CustomEvent<ConsentState>).detail ?? readConsent());
  window.addEventListener(CONSENT_EVENT, listener);
  return () => window.removeEventListener(CONSENT_EVENT, listener);
}
