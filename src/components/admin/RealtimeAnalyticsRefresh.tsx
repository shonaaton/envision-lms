"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Revalidates the live analytics data without changing the current URL. This
 * component exists only on the real-time page, so its timer is disposed when
 * an admin navigates elsewhere.
 */
export default function RealtimeAnalyticsRefresh() {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) router.refresh();
    };
    const timer = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(timer);
  }, [router]);

  return null;
}
