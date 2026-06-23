"use client";
import { SessionProvider } from "next-auth/react";
import NavigationFeedback from "@/components/feedback/NavigationFeedback";
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <NavigationFeedback />
    </SessionProvider>
  );
}
