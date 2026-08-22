"use client";

import { useEffect } from "react";
import AppErrorScreen from "@/components/common/AppErrorScreen";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error boundary caught an error.", error);

    const payload = {
      source: "global-error-boundary",
      message: error.message || "Global error boundary caught an error.",
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

  return (
    <html lang="en">
      <body>
        <AppErrorScreen
          error={error}
          reset={reset}
          title="We could not load the app"
          message="A shared part of the app failed while loading. Try again once, or return to the dashboard."
        />
      </body>
    </html>
  );
}
