"use client";

import { useEffect, useState } from "react";
import { ACADEMY_TIME_ZONE } from "@/lib/academyTime";

export type ViewerRole = "student" | "instructor" | "admin" | "sub-admin" | string | undefined;

/**
 * Which IANA timezone a piece of UI should format dates in, given who's
 * looking at it.
 *
 * Admins/sub-admins always see the academy's own operating timezone (IST) —
 * that's the canonical schedule the office, coaches, and reports all plan
 * against. Students and instructors (including demo accounts) see their own
 * device's timezone instead, since they may not be in India.
 *
 * This ONLY affects display. Every timestamp still comes from the server as
 * UTC, and every piece of scheduling business logic (join windows,
 * attendance day-matching, credit day boundaries, `academyDateKey` /
 * `academyDayBounds` / `isJoinWindowOpen`) must keep using ACADEMY_TIME_ZONE
 * directly — never derive that from this hook. This hook is for the render
 * layer only.
 */
export function useViewerTimeZone(role: ViewerRole) {
  const isAcademyViewer = role === "admin" || role === "sub-admin";
  const [detectedZone, setDetectedZone] = useState<string | null>(null);

  useEffect(() => {
    if (isAcademyViewer) return;
    try {
      setDetectedZone(Intl.DateTimeFormat().resolvedOptions().timeZone || null);
    } catch {
      setDetectedZone(null);
    }
    // Only role changes should re-run detection; the browser's own zone
    // doesn't change mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAcademyViewer]);

  return {
    timeZone: isAcademyViewer ? ACADEMY_TIME_ZONE : detectedZone || ACADEMY_TIME_ZONE,
    isAcademyTime: isAcademyViewer,
    // False for one render on the client before detection resolves — lets
    // callers avoid flashing a wrongly-labelled zone abbreviation. Server-
    // rendered output always has this as `false` for non-admins, which is
    // fine: the visible time itself falls back to IST until the client
    // re-renders with the detected zone, it just isn't labelled as local yet.
    resolved: isAcademyViewer || detectedZone !== null,
  };
}

/** Short zone label for a timestamp in a given IANA zone, e.g. "IST" or "GMT+2". */
export function zoneAbbreviation(value: string | Date | null | undefined, timeZone: string) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" }).formatToParts(date);
    return parts.find((part) => part.type === "timeZoneName")?.value || "";
  } catch {
    return "";
  }
}
