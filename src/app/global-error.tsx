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
