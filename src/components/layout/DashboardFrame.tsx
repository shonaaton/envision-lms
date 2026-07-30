"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import LiveDataRefresher from "@/components/layout/LiveDataRefresher";
import Sidebar from "@/components/layout/Sidebar";

type Role = "student" | "instructor" | "admin";
type AccountStatus = "demo" | "enrolled" | "coach_applicant" | "approved" | "rejected";

export default function DashboardFrame({
  role,
  accountStatus,
  isSuperAdmin,
  featureState,
  user,
  children,
}: {
  role: Role;
  accountStatus?: AccountStatus;
  isSuperAdmin?: boolean;
  featureState?: Record<string, { visible: boolean; status: "enabled" | "disabled" | "testing" | "coming_soon" }>;
  user: { name?: string | null; role: string };
  children: ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [desktopNavCollapsed, setDesktopNavCollapsed] = useState(false);

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
      <Sidebar
        role={role}
        accountStatus={accountStatus}
        isSuperAdmin={isSuperAdmin}
        featureState={featureState}
        mobileOpen={mobileNavOpen}
        desktopCollapsed={desktopNavCollapsed}
        user={user}
        onToggleDesktop={() => setDesktopNavCollapsed((value) => !value)}
        onCloseMobile={() => setMobileNavOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col md:h-full">
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="fixed left-3 top-3 z-30 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-brand/15 bg-white text-brand shadow-lg shadow-brand-900/10 transition hover:border-brand/35 hover:bg-brand-50 md:hidden"
          aria-label="Open navigation"
        >
          <Menu size={19} />
        </button>
        <main className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-16 sm:px-5 md:py-4 lg:px-6">
          <div className="mx-auto w-full max-w-[1720px]">{children}</div>
        </main>
      </div>
      <LiveDataRefresher />
    </div>
  );
}
