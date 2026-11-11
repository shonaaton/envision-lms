"use client";

type FbqWindow = Window & {
  fbq?: (...args: unknown[]) => void;
  /** Pixel ids already started on this page load. */
  __metaPixelsReady?: Record<string, boolean>;
};

/**
 * Two pixels, one per part of the site, and a page only ever reports to its own.
 *
 * The free demo campaign (the landing page, its form and its thank-you page)
 * reports to the campaign pixel alone; every other public page reports to the
 * site-wide one. `fbq` cannot drop a pixel once it has started, and a visitor
 * can move between the two parts without a page load, so nothing here uses
 * `fbq('track')`, which goes to every started pixel. Each event is sent with
 * `trackSingle` to the pixel that owns the page it happened on.
 *
 * The campaign pages send page views plus one Lead event, from the thank-you
 * page, when a family arrives there from the form. Nothing else, and nothing
 * from the server: the Conversions API (lib/metaConversions) posts to the
 * site-wide pixel only.
 */
const SITE_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || "924225047079586";
export const CAMPAIGN_PIXEL_ID = process.env.NEXT_PUBLIC_META_CAMPAIGN_PIXEL_ID || "1084805421260422";
const CAMPAIGN_PIXEL_PATH = "/book-free-demo-class";

export function isCampaignPixelPath(pathname?: string | null) {
  const path = String(pathname || "");
  return Boolean(CAMPAIGN_PIXEL_ID) && (path === CAMPAIGN_PIXEL_PATH || path.startsWith(`${CAMPAIGN_PIXEL_PATH}/`));
}

export function metaPixelIdForPath(pathname?: string | null, sitePixelId = SITE_PIXEL_ID) {
  return isCampaignPixelPath(pathname) ? CAMPAIGN_PIXEL_ID : sitePixelId;
}

/** Sends one event to the pixel that owns the current page, starting that pixel first if this visit has not yet. */
function trackMetaEvent(eventName: string, eventID?: string) {
  if (typeof window === "undefined") return;
  const win = window as FbqWindow;
  const fbq = win.fbq;
  if (typeof fbq !== "function") return;
  const pixelId = metaPixelIdForPath(window.location.pathname);
  if (!pixelId) return;
  const ready = (win.__metaPixelsReady ||= {});
  if (!ready[pixelId]) {
    fbq("init", pixelId);
    ready[pixelId] = true;
  }
  if (eventID) {
    fbq("trackSingle", pixelId, eventName, {}, { eventID });
    return;
  }
  fbq("trackSingle", pixelId, eventName);
}

function fallbackEventId(prefix: string, rawId?: unknown) {
  const id = typeof rawId === "string" ? rawId : "";
  return id ? `${prefix}_${id}` : undefined;
}

export function trackMetaPageView() {
  trackMetaEvent("PageView");
}

export function trackMetaCompleteRegistration(metaEventId?: unknown, userId?: unknown) {
  const eventID = typeof metaEventId === "string" && metaEventId
    ? metaEventId
    : fallbackEventId("demo_registration", userId);
  trackMetaEvent("CompleteRegistration", eventID);
}

export function trackMetaLead(metaEventId?: unknown) {
  trackMetaEvent("Lead", typeof metaEventId === "string" && metaEventId ? metaEventId : undefined);
}

export function trackMetaSchedule(metaEventId?: unknown, bookingId?: unknown) {
  const eventID = typeof metaEventId === "string" && metaEventId
    ? metaEventId
    : fallbackEventId("demo_booking", bookingId);
  trackMetaEvent("Schedule", eventID);
}
