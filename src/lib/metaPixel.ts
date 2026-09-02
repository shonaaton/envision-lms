"use client";

type FbqWindow = Window & {
  fbq?: (...args: unknown[]) => void;
};

function fallbackEventId(prefix: string, rawId?: unknown) {
  const id = typeof rawId === "string" ? rawId : "";
  return id ? `${prefix}_${id}` : undefined;
}

function trackMetaEvent(eventName: string, eventID?: string) {
  if (typeof window === "undefined") return;
  const fbq = (window as FbqWindow).fbq;
  if (typeof fbq !== "function") return;
  if (eventID) {
    fbq("track", eventName, {}, { eventID });
    return;
  }
  fbq("track", eventName);
}

export function trackMetaPageView() {
  if (typeof window === "undefined") return;
  const fbq = (window as FbqWindow).fbq;
  if (typeof fbq !== "function") return;
  fbq("track", "PageView");
}

export function trackMetaCompleteRegistration(metaEventId?: unknown, userId?: unknown) {
  const eventID = typeof metaEventId === "string" && metaEventId
    ? metaEventId
    : fallbackEventId("demo_registration", userId);
  trackMetaEvent("CompleteRegistration", eventID);
}

export function trackMetaSchedule(metaEventId?: unknown, bookingId?: unknown) {
  const eventID = typeof metaEventId === "string" && metaEventId
    ? metaEventId
    : fallbackEventId("demo_booking", bookingId);
  trackMetaEvent("Schedule", eventID);
}
