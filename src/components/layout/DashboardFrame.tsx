"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import LiveDataRefresher from "@/components/layout/LiveDataRefresher";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";

type Role = "student" | "instructor" | "admin";
type AccountStatus = "demo" | "enrolled" | "coach_applicant" | "approved" | "rejected";

export default function DashboardFrame({
  role,
  accountStatus,
  user,
  children,
}: {
  role: Role;
  accountStatus?: AccountStatus;
  user: { name?: string | null; role: string };
  children: ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = mobileNavOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!mobileNavOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileNavOpen]);

  return (
    <div className="flex min-h-dvh bg-[linear-gradient(180deg,#f8fafc_0%,#f3f0f7_52%,#f8fafc_100%)] text-slate-950 md:h-dvh md:overflow-hidden">
      <Sidebar role={role} accountStatus={accountStatus} mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col md:h-full">
        <Topbar user={user} onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5 lg:px-6">
          <div className="mx-auto w-full max-w-[1720px]">{children}</div>
        </main>
      </div>
      <LiveDataRefresher />
    </div>
  );
}
