"use client";

import { formatAcademyDateTime } from "@/lib/academyTime";
import { useViewerTimeZone, zoneAbbreviation, type ViewerRole } from "@/lib/viewerTime";

type LocalTimeProps = {
  value: string | Date | null | undefined;
  role: ViewerRole;
  options?: Intl.DateTimeFormatOptions;
  /**
   * For students/instructors, also show the IST time alongside their local
   * time so there's never ambiguity when coordinating with the academy
   * office or a coach in India. Defaults on; set false for a compact
   * local-only display (e.g. a dense table column).
   */
  showIstAlongside?: boolean;
  fallback?: string;
  className?: string;
};

/**
 * Drop-in replacement for calling `formatAcademyDateTime` directly in a
 * client component when the audience isn't guaranteed to be in India.
 * Admins/sub-admins see IST (unchanged from today); students, instructors,
 * and demo accounts see their own device's timezone.
 *
 * Usage: <LocalTime value={session.scheduledFor} role={role} />
 */
export function LocalTime({ value, role, options, showIstAlongside = true, fallback = "Not set", className }: LocalTimeProps) {
  const { timeZone, isAcademyTime, resolved } = useViewerTimeZone(role);
  if (!value) return <span className={className}>{fallback}</span>;

  const primary = formatAcademyDateTime(value, options, timeZone);
  const abbrev = resolved ? zoneAbbreviation(value, timeZone) : "";
  const showIst = !isAcademyTime && showIstAlongside;
  const ist = showIst ? formatAcademyDateTime(value, options, "Asia/Kolkata") : null;

  return (
    <span className={className}>
      {primary}
      {abbrev ? <span className="ml-1 text-[10px] font-semibold uppercase text-slate-400">{abbrev}</span> : null}
      {ist ? <span className="ml-1 text-xs text-slate-400">({ist} IST)</span> : null}
    </span>
  );
}
