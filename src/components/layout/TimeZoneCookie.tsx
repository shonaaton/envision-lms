"use client";

import { useEffect } from "react";

/**
 * Tells the server which timezone this device is in, through a cookie the
 * dashboard layout reads on the next page load (lib/localTime/stampTimeZone).
 * No request of its own, so nothing refreshes and nothing is shown.
 */
export default function TimeZoneCookie() {
  useEffect(() => {
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!zone) return;
      const value = encodeURIComponent(zone);
      if (document.cookie.split("; ").includes(`ec_tz=${value}`)) return;
      document.cookie = `ec_tz=${value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    } catch {
      // Older browsers: staff fall back to the city or phone code.
    }
  }, []);
  return null;
}
