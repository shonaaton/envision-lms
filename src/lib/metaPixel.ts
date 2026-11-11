"use client";

import { readConsent } from "@/lib/cookieConsent";

/**
 * The site's only Meta pixel, and it lives on the free demo campaign alone:
 * the landing page, its form and its thank-you page. No other page loads Meta's
 * script or sends it anything, and the server sends Meta nothing at all.
 *
 * What it reports: a page view of each campaign page, and one Lead event from
 * the thank-you page when a family arrives there from the form.
 *
 * Nothing loads until the visitor accepts marketing cookies. Every call here
 * checks that first, so callers need no consent logic of their own.
 */
export const CAMPAIGN_PIXEL_ID = process.env.NEXT_PUBLIC_META_CAMPAIGN_PIXEL_ID || "1084805421260422";
const CAMPAIGN_PIXEL_PATH = "/book-free-demo-class";

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[];
  push?: unknown;
  loaded?: boolean;
  version?: string;
};

type FbqWindow = Window & {
  fbq?: Fbq;
  _fbq?: Fbq;
  __campaignPixelReady?: boolean;
  __metaLastPageView?: string;
};

export function isCampaignPixelPath(pathname?: string | null) {
  const path = String(pathname || "");
  return Boolean(CAMPAIGN_PIXEL_ID) && (path === CAMPAIGN_PIXEL_PATH || path.startsWith(`${CAMPAIGN_PIXEL_PATH}/`));
}

/** Meta's own bootstrap: a queue that holds calls until fbevents.js has loaded. */
function loadMetaScript(win: FbqWindow) {
  const fbq: Fbq = (...args: unknown[]) => {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue?.push(args);
  };
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  win.fbq = fbq;
  if (!win._fbq) win._fbq = fbq;
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
}

/** The pixel, started if need be. Null off the campaign pages or without marketing consent. */
function campaignPixel() {
  if (typeof window === "undefined" || !isCampaignPixelPath(window.location.pathname)) return null;
  if (readConsent()?.marketing !== true) return null;
  const win = window as FbqWindow;
  if (typeof win.fbq !== "function") loadMetaScript(win);
  if (!win.__campaignPixelReady) {
    win.fbq?.("init", CAMPAIGN_PIXEL_ID);
    win.__campaignPixelReady = true;
  }
  return win.fbq || null;
}

/** One page view per page: asking twice for the same address in a row sends one. */
export function trackMetaPageView() {
  const fbq = campaignPixel();
  if (!fbq) return;
  const win = window as FbqWindow;
  const address = `${window.location.pathname}${window.location.search}`;
  if (win.__metaLastPageView === address) return;
  win.__metaLastPageView = address;
  fbq("track", "PageView");
}

/** The form-submit conversion. The event id lets Meta drop an accidental repeat. */
export function trackMetaLead(eventId?: unknown) {
  const fbq = campaignPixel();
  if (!fbq) return;
  if (typeof eventId === "string" && eventId) fbq("track", "Lead", {}, { eventID: eventId });
  else fbq("track", "Lead");
}
