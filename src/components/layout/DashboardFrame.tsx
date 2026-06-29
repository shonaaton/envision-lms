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

  return (
    <div className="flex min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(253,231,90,0.18),transparent_28%),linear-gradient(135deg,#fff_0%,#fbf7ff_48%,#fff8c9_140%)]">
      <Sidebar role={role} accountStatus={accountStatus} mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="flex-1 overflow-y-auto p-2 sm:p-4">
          <div className="mx-auto w-full max-w-[1800px]">{children}</div>
        </main>
      </div>
      <LiveDataRefresher />
    </div>
  );
}
