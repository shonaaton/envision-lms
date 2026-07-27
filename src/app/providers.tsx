"use client";
import { Suspense } from "react";
import { SessionProvider } from "next-auth/react";
import NavigationFeedback from "@/components/feedback/NavigationFeedback";
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <Suspense fallback={null}>
        <NavigationFeedback />
      </Suspense>
    </SessionProvider>
  );
}
