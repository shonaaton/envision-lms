"use client";

import { useEffect } from "react";
import AppErrorScreen from "@/components/common/AppErrorScreen";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Route error boundary caught an error.", error);

    const payload = {
      source: "route-error-boundary",
      message: error.message || "Route error boundary caught an error.",
      digest: error.digest,
      pathname: window.location.pathname,
      stack: error.stack,
    };

    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/client-errors", new Blob([body], { type: "application/json" }));
      return;
    }

    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => null);
  }, [error]);

  return <AppErrorScreen error={error} reset={reset} />;
}
