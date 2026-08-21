"use client";

import { useEffect } from "react";
import AppErrorScreen from "@/components/common/AppErrorScreen";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error boundary caught an error.", error);
  }, [error]);

  return (
    <AppErrorScreen
      error={error}
      reset={reset}
      title="This dashboard page did not load"
      message="This looks like a temporary server problem. Try again, and if it repeats, share the error reference with us."
    />
  );
}
