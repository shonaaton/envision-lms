"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import LiveDataRefresher from "@/components/layout/LiveDataRefresher";
import Sidebar from "@/components/layout/Sidebar";

type Role = "student" | "instructor" | "admin" | "sub-admin";
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
  featureState?: Record<string, { visible: boolean; status: "enabled" | "disabled" | "testing" | "coming_soon"; permissions: string[] }>;
  user: { name?: string | null; role: string; isActive?: boolean };
  children: ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [desktopNavCollapsed, setDesktopNavCollapsed] = useState(false);
  const pathname = usePathname() || "";
  const useCompactUi = !isProtectedLearningRoute(pathname);

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
        {user.isActive === false && (
          <div className="border-b border-amber-200 bg-amber-50 py-2 pl-14 pr-4 text-center text-sm font-semibold text-amber-900 md:px-4">
            This account is inactive. You can sign in, but class-related features are unavailable. Contact the academy to reactivate access.
          </div>
        )}
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="fixed left-3 top-3 z-30 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-brand/15 bg-white text-brand shadow-lg shadow-brand-900/10 transition hover:border-brand/35 hover:bg-brand-50 md:hidden"
          aria-label="Open navigation"
        >
          <Menu size={19} />
        </button>
        <main className={`min-h-0 flex-1 overflow-y-auto px-2 pb-4 pt-14 sm:px-5 md:py-4 lg:px-6 ${useCompactUi ? "compact-dashboard-ui" : ""}`}>
          <div className="mx-auto w-full max-w-[1720px]">{children}</div>
        </main>
      </div>
      <LiveDataRefresher />
    </div>
  );
}

function isProtectedLearningRoute(pathname: string) {
  const protectedPrefixes = [
    "/homework",
    "/instructor/homework",
    "/admin/homework-templates",
    "/quizzes",
    "/instructor/quizzes",
    "/tournaments",
    "/play",
    "/analysis",
    "/pgn",
    "/king-hunt",
    "/square-trainer",
    "/tactics-trainer",
  ];
  if (/^\/classrooms\/[^/]+\/live(?:\/|$)/.test(pathname)) return true;
  return protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
