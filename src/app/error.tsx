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
  }, [error]);

  return <AppErrorScreen error={error} reset={reset} />;
}
