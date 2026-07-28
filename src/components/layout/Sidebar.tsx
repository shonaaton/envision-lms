"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ActivitySquare,
  Banknote,
  BarChart3,
  Bell,
  BookOpen,
  BookOpenCheck,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Cpu,
  Crosshair,
  Crown,
  FileText,
  LayoutDashboard,
  Library,
  ListChecks,
  Megaphone,
  MessageSquare,
  Receipt,
  Settings,
  Trophy,
  Users,
  WalletCards,
  UserPlus,
  Target,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";
import Logo from "./Logo";
import { cn } from "@/lib/utils";
import { bookingFeatureNameForAccount } from "@/lib/bookingLabels";

type Role = "student" | "instructor" | "admin";
type AccountStatus = "demo" | "enrolled" | "coach_applicant" | "approved" | "rejected";
type NavItem = { href: string; label: string; icon: any; roles?: Role[]; demoOnly?: boolean; hideForDemo?: boolean };
type NavSection = { id: string; title: string; items: NavItem[]; roles?: Role[] };

const sections: NavSection[] = [
  {
    id: "academy",
    title: "Academy",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    id: "class-tools",
    title: "Class Tools",
    items: [
      { href: "/classrooms", label: "Classrooms", icon: BookOpen },
      { href: "/availability", label: "Available Times", icon: CalendarDays, roles: ["instructor", "admin"] },
      { href: "/booking", label: "Booking", icon: CalendarDays, roles: ["student"] },
      { href: "/ask-coach", label: "Ask Coach", icon: MessageSquare },
      { href: "/homework", label: "Homework", icon: FileText },
      { href: "/attendance", label: "Attendance", icon: ClipboardList },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/tournaments", label: "Tournaments", icon: Trophy },
      { href: "/leaderboard", label: "Leaderboards", icon: Trophy },
    ],
  },
  {
    id: "chess-tools",
    title: "Chess Tools",
    items: [
      { href: "/pgn", label: "PGN Library", icon: Library, roles: ["instructor", "admin"] },
      { href: "/analysis", label: "Analysis Board", icon: ListChecks, roles: ["instructor", "admin"] },
      { href: "/play/tactics-trainer", label: "Tactics Trainer", icon: Target, roles: ["student", "admin"] },
      { href: "/play/king-hunt", label: "King Hunt", icon: Crown, roles: ["student", "admin"] },
      { href: "/play/square-trainer", label: "Square Trainer", icon: Crosshair, roles: ["student", "admin"] },
      { href: "/play/computer", label: "Play vs Computer", icon: Cpu, roles: ["student", "admin"] },
    ],
  },
  {
    id: "fees-management",
    title: "Fees Management",
    roles: ["admin"],
    items: [
      { href: "/fees", label: "Fee Dashboard", icon: Banknote },
      { href: "/fees/fee-plans", label: "Fee Plans", icon: FileText },
      { href: "/fees/student-fees", label: "Student Fees", icon: Users },
      { href: "/fees/credit-monitoring", label: "Credit Monitoring", icon: WalletCards },
      { href: "/fees/invoices", label: "Invoices", icon: Receipt },
      { href: "/fees/reports", label: "Fee Reports", icon: BarChart3 },
    ],
  },
  {
    id: "student-billing",
    title: "Billing",
    roles: ["student"],
    items: [
      { href: "/fees", label: "Credits & Payments", icon: WalletCards },
      { href: "/fees/credit-history", label: "Credit History", icon: WalletCards },
      { href: "/fees/invoices", label: "My Invoices", icon: Receipt },
    ],
  },
  {
    id: "administration",
    title: "Administration",
    roles: ["admin"],
    items: [
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/onboarding", label: "Onboarding", icon: UserPlus },
      { href: "/admin/courses", label: "Courses", icon: BookOpenCheck },
      { href: "/admin/activity-tracker", label: "Activity Tracker", icon: ActivitySquare },
      { href: "/admin/reports", label: "Reports Center", icon: BarChart3 },
      { href: "/admin/announcements", label: "Announcements", icon: Megaphone },
      { href: "/admin/notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    id: "settings",
    title: "Settings",
    items: [{ href: "/admin/settings", label: "Academy Setup", icon: Settings, roles: ["admin"] }],
  },
];

function canSee(role: Role, accountStatus: AccountStatus | undefined, item: { roles?: Role[]; demoOnly?: boolean; hideForDemo?: boolean }) {
  const isDemo = accountStatus === "demo";
  if (item.demoOnly && !isDemo) return false;
  if (item.hideForDemo && isDemo) return false;
  if (isDemo) {
    const demoAllowed = ["/dashboard", "/booking", "/play/square-trainer", "/play/tactics-trainer", "/play/king-hunt", "/play/computer"];
    if ("href" in item && typeof (item as any).href === "string" && !demoAllowed.includes((item as any).href)) return false;
  }
  return !item.roles || item.roles.includes(role);
}

function isActive(pathname: string, item: NavItem) {
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export default function Sidebar({
  role,
  accountStatus,
  mobileOpen = false,
  desktopCollapsed = false,
  onToggleDesktop,
  onCloseMobile,
}: {
  role: Role;
  accountStatus?: AccountStatus;
  mobileOpen?: boolean;
  desktopCollapsed?: boolean;
  onToggleDesktop?: () => void;
  onCloseMobile?: () => void;
}) {
  const pathname = usePathname() || "";
  const visibleSections = useMemo(
    () =>
      sections
        .filter((section) => canSee(role, accountStatus, section))
        .map((section) => ({ ...section, items: section.items.filter((item) => canSee(role, accountStatus, item)) }))
        .filter((section) => section.items.length > 0),
    [role, accountStatus]
  );
  const activeSection = visibleSections.find((section) => section.items.some((item) => isActive(pathname, item)))?.id || "academy";
  const [openSections, setOpenSections] = useState<string[]>([activeSection]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("sidebar-open-sections");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setOpenSections(Array.from(new Set([...parsed, activeSection])));
          return;
        }
      }
    } catch {
      // Remembering sidebar state is optional.
    }
    setOpenSections([activeSection]);
  }, [activeSection]);

  useEffect(() => {
    window.localStorage.setItem("sidebar-open-sections", JSON.stringify(openSections));
  }, [openSections]);

  function toggleSection(id: string) {
    setOpenSections((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close navigation"
        onClick={onCloseMobile}
        className={cn("fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm transition-opacity duration-300 md:hidden", mobileOpen ? "opacity-100" : "pointer-events-none opacity-0")}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-dvh w-[min(88vw,20rem)] flex-shrink-0 flex-col border-r border-white/10 bg-[linear-gradient(180deg,#451059_0%,#2a0936_58%,#14051c_100%)] px-3 py-4 shadow-2xl shadow-brand-900/30 transition-[width,transform] duration-300 ease-out will-change-transform md:sticky md:top-0 md:z-20 md:h-dvh md:translate-x-0",
          desktopCollapsed ? "md:w-[5.5rem]" : "md:w-[16.5rem] lg:w-72",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
      <div className={cn("mb-4 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.08] px-3 py-3 shadow-lg shadow-black/10 backdrop-blur", desktopCollapsed ? "md:justify-center md:px-2" : "")}>
        <div className={cn("min-w-0 flex-1", desktopCollapsed ? "md:hidden" : "")}><Logo /></div>
        <button
          type="button"
          onClick={onToggleDesktop}
          className="hidden h-10 w-10 flex-none place-items-center rounded-lg bg-white/10 text-white transition hover:bg-white/20 md:grid"
          aria-label={desktopCollapsed ? "Expand navigation" : "Collapse navigation"}
          title={desktopCollapsed ? "Expand navigation" : "Collapse navigation"}
        >
          {desktopCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
        <button
          type="button"
          onClick={onCloseMobile}
          className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-white/10 text-white transition hover:bg-white/20 md:hidden"
          aria-label="Close navigation"
        >
          <X size={18} />
        </button>
      </div>
      <nav className="flex-1 space-y-2 overflow-y-auto pr-1" aria-label="Dashboard navigation">
        {visibleSections.map((section) => {
          const expanded = openSections.includes(section.id);
          const sectionActive = section.items.some((item) => isActive(pathname, item));
          return (
            <div key={section.id} className={cn("rounded-lg border transition", sectionActive ? "border-accent/30 bg-white/[0.08]" : "border-transparent")}>
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                aria-expanded={expanded}
                title={desktopCollapsed ? section.title : undefined}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.16em] transition",
                  desktopCollapsed ? "md:justify-center md:px-2" : "",
                  sectionActive ? "text-accent" : "text-accent/80 hover:bg-white/10 hover:text-accent"
                )}
              >
                <span className={cn(desktopCollapsed ? "md:hidden" : "")}>{section.title}</span>
                <ChevronDown size={15} className={cn("transition", expanded ? "rotate-180" : "", desktopCollapsed ? "md:hidden" : "")} />
              </button>
              {expanded && (
                <ul className="space-y-1 px-1 pb-2">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(pathname, item);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={onCloseMobile}
                          title={desktopCollapsed ? (item.href === "/booking" ? bookingFeatureNameForAccount(accountStatus) : item.label) : undefined}
                          className={cn(
                            "group flex min-h-10 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition",
                            desktopCollapsed ? "md:justify-center md:px-2" : "",
                            active ? "bg-white text-brand shadow-lg shadow-black/10" : "text-white/75 hover:bg-white/10 hover:text-white"
                          )}
                        >
                          <span className={cn("flex h-7 w-7 flex-none items-center justify-center rounded-md transition", active ? "bg-accent text-brand" : "bg-white/10 text-accent group-hover:bg-accent group-hover:text-brand")}>
                            <Icon size={16} />
                          </span>
                          <span className={cn("truncate", desktopCollapsed ? "md:hidden" : "")}>{item.href === "/booking" ? bookingFeatureNameForAccount(accountStatus) : item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
      <div className={cn("mt-4 rounded-lg border border-white/10 bg-white/[0.08] p-3 text-sm text-white/80", desktopCollapsed ? "md:hidden" : "")}>
        <div className="font-semibold text-white">Envision Academy</div>
        <div className="mt-1 text-xs leading-relaxed text-white/60">Premium chess tools, classes, PGNs, tournaments, and progress in one place.</div>
      </div>
    </aside>
    </>
  );
}
