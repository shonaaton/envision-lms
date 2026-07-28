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
  ShieldCheck,
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
type FeatureStatus = "enabled" | "disabled" | "testing" | "coming_soon";
type FeatureState = Record<string, { visible: boolean; status: FeatureStatus }>;
type NavItem = { href: string; label: string; icon: any; featureKey?: string; roles?: Role[]; demoOnly?: boolean; hideForDemo?: boolean; superAdminOnly?: boolean };
type NavSection = { id: string; title: string; items: NavItem[]; roles?: Role[]; superAdminOnly?: boolean };

const sections: NavSection[] = [
  {
    id: "academy",
    title: "Academy",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, featureKey: "dashboard" }],
  },
  {
    id: "class-tools",
    title: "Class Tools",
    items: [
      { href: "/classrooms", label: "Classrooms", icon: BookOpen, featureKey: "classrooms" },
      { href: "/availability", label: "Available Times", icon: CalendarDays, featureKey: "calendar", roles: ["instructor", "admin"] },
      { href: "/booking", label: "Booking", icon: CalendarDays, featureKey: "calendar", roles: ["student"] },
      { href: "/ask-coach", label: "Ask Coach", icon: MessageSquare, featureKey: "askCoach" },
      { href: "/homework", label: "Homework", icon: FileText, featureKey: "homework" },
      { href: "/attendance", label: "Attendance", icon: ClipboardList, featureKey: "attendance" },
      { href: "/calendar", label: "Calendar", icon: CalendarDays, featureKey: "calendar" },
      { href: "/tournaments", label: "Tournaments", icon: Trophy, featureKey: "tournaments" },
      { href: "/leaderboard", label: "Leaderboards", icon: Trophy, featureKey: "leaderboards" },
    ],
  },
  {
    id: "chess-tools",
    title: "Chess Tools",
    items: [
      { href: "/pgn", label: "PGN Library", icon: Library, featureKey: "pgnLibrary", roles: ["instructor", "admin"] },
      { href: "/analysis", label: "Analysis Board", icon: ListChecks, featureKey: "analysisBoard", roles: ["instructor", "admin"] },
      { href: "/play/tactics-trainer", label: "Tactics Trainer", icon: Target, featureKey: "tacticsTrainer", roles: ["student", "admin"] },
      { href: "/play/king-hunt", label: "King Hunt", icon: Crown, featureKey: "kingHunt", roles: ["student", "admin"] },
      { href: "/play/square-trainer", label: "Square Trainer", icon: Crosshair, featureKey: "squareTrainer", roles: ["student", "admin"] },
      { href: "/play/computer", label: "Play vs Computer", icon: Cpu, featureKey: "playVsComputer", roles: ["student", "admin"] },
    ],
  },
  {
    id: "fees-management",
    title: "Fees Management",
    roles: ["admin"],
    items: [
      { href: "/fees", label: "Fee Dashboard", icon: Banknote, featureKey: "fees" },
      { href: "/fees/fee-plans", label: "Fee Plans", icon: FileText, featureKey: "fees" },
      { href: "/fees/student-fees", label: "Student Fees", icon: Users, featureKey: "fees" },
      { href: "/fees/credit-monitoring", label: "Credit Monitoring", icon: WalletCards, featureKey: "fees" },
      { href: "/fees/invoices", label: "Invoices", icon: Receipt, featureKey: "fees" },
      { href: "/fees/reports", label: "Fee Reports", icon: BarChart3, featureKey: "fees" },
    ],
  },
  {
    id: "student-billing",
    title: "Billing",
    roles: ["student"],
    items: [
      { href: "/fees", label: "Credits & Payments", icon: WalletCards, featureKey: "fees" },
      { href: "/fees/credit-history", label: "Credit History", icon: WalletCards, featureKey: "fees" },
      { href: "/fees/invoices", label: "My Invoices", icon: Receipt, featureKey: "fees" },
    ],
  },
  {
    id: "administration",
    title: "Administration",
    roles: ["admin"],
    items: [
      { href: "/admin/users", label: "Users", icon: Users, featureKey: "userManagement" },
      { href: "/admin/onboarding", label: "Onboarding", icon: UserPlus, featureKey: "onboarding" },
      { href: "/admin/courses", label: "Courses", icon: BookOpenCheck, featureKey: "courseManagement" },
      { href: "/admin/activity-tracker", label: "Activity Tracker", icon: ActivitySquare, featureKey: "reports" },
      { href: "/admin/reports", label: "Reports Center", icon: BarChart3, featureKey: "reports" },
      { href: "/admin/announcements", label: "Announcements", icon: Megaphone, featureKey: "announcements" },
      { href: "/admin/notifications", label: "Notifications", icon: Bell, featureKey: "notifications" },
    ],
  },
  {
    id: "settings",
    title: "Settings",
    items: [
      { href: "/admin/settings", label: "Academy Setup", icon: Settings, featureKey: "academySettings", roles: ["admin"] },
      { href: "/admin/feature-access", label: "Feature Access", icon: ShieldCheck, featureKey: "featureAccess", roles: ["admin"], superAdminOnly: true },
    ],
  },
];

function canSee(role: Role, accountStatus: AccountStatus | undefined, isSuperAdmin: boolean | undefined, featureState: FeatureState | undefined, item: { roles?: Role[]; demoOnly?: boolean; hideForDemo?: boolean; featureKey?: string; superAdminOnly?: boolean }) {
  const isDemo = accountStatus === "demo";
  if (item.superAdminOnly && !isSuperAdmin) return false;
  if (item.featureKey && featureState?.[item.featureKey] && !featureState[item.featureKey].visible) return false;
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
  isSuperAdmin,
  featureState,
  mobileOpen = false,
  desktopCollapsed = false,
  onToggleDesktop,
  onCloseMobile,
}: {
  role: Role;
  accountStatus?: AccountStatus;
  isSuperAdmin?: boolean;
  featureState?: FeatureState;
  mobileOpen?: boolean;
  desktopCollapsed?: boolean;
  onToggleDesktop?: () => void;
  onCloseMobile?: () => void;
}) {
  const pathname = usePathname() || "";
  const [askCoachUnreadCount, setAskCoachUnreadCount] = useState(0);
  const visibleSections = useMemo(
    () =>
      sections
        .filter((section) => canSee(role, accountStatus, isSuperAdmin, featureState, section))
        .map((section) => ({ ...section, items: section.items.filter((item) => canSee(role, accountStatus, isSuperAdmin, featureState, item)) }))
        .filter((section) => section.items.length > 0),
    [role, accountStatus, isSuperAdmin, featureState]
  );
  const pinnedItems = useMemo(() => {
    const pinnedHrefs = ["/dashboard", "/classrooms", "/homework", "/calendar", "/fees"];
    return pinnedHrefs
      .map((href) => visibleSections.flatMap((section) => section.items).find((item) => item.href === href))
      .filter(Boolean) as NavItem[];
  }, [visibleSections]);
  const activeSection = visibleSections.find((section) => section.items.some((item) => isActive(pathname, item)))?.id || "academy";
  const [openSections, setOpenSections] = useState<string[]>([activeSection]);

  useEffect(() => {
    let mounted = true;
    async function loadAskCoachUnreadCount() {
      const res = await fetch("/api/ask-coach?summary=1", { cache: "no-store" }).catch(() => null);
      if (!res?.ok) return;
      const data = await res.json().catch(() => ({}));
      if (mounted) setAskCoachUnreadCount(Number(data.unreadCount || 0));
    }
    void loadAskCoachUnreadCount();
    const timer = window.setInterval(() => void loadAskCoachUnreadCount(), 10000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

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
        {pinnedItems.length > 0 && (
          <div className="rounded-lg border border-accent/25 bg-white/[0.10] p-1.5">
            <div className={cn("px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-accent/90", desktopCollapsed ? "md:hidden" : "")}>
              Pinned
            </div>
            <ul className="grid gap-1">
              {pinnedItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item);
                return (
                  <li key={`pinned-${item.href}`}>
                    <Link
                      href={item.href}
                      onClick={onCloseMobile}
                      title={desktopCollapsed ? (item.href === "/booking" ? bookingFeatureNameForAccount(accountStatus) : item.label) : undefined}
                      className={cn(
                        "group relative flex min-h-10 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition",
                        desktopCollapsed ? "md:justify-center md:px-2" : "",
                        active ? "bg-accent text-brand shadow-lg shadow-black/10" : "text-white/85 hover:bg-white/10 hover:text-white"
                      )}
                    >
                      <span className={cn("flex h-7 w-7 flex-none items-center justify-center rounded-md transition", active ? "bg-brand text-accent" : "bg-white/10 text-accent group-hover:bg-accent group-hover:text-brand")}>
                        <Icon size={16} />
                      </span>
                      <span className={cn("truncate", desktopCollapsed ? "md:hidden" : "")}>{item.label === "Fee Dashboard" ? "Fees" : item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
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
                    const comingSoon = item.featureKey ? featureState?.[item.featureKey]?.status === "coming_soon" : false;
                    return (
                      <li key={item.href}>
                        <Link
                          href={comingSoon ? "#" : item.href}
                          onClick={onCloseMobile}
                          title={desktopCollapsed ? (item.href === "/booking" ? bookingFeatureNameForAccount(accountStatus) : item.label) : undefined}
                          className={cn(
                            "group relative flex min-h-10 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition",
                            desktopCollapsed ? "md:justify-center md:px-2" : "",
                            active ? "bg-white text-brand shadow-lg shadow-black/10" : comingSoon ? "cursor-not-allowed text-white/45" : "text-white/75 hover:bg-white/10 hover:text-white"
                          )}
                          aria-disabled={comingSoon}
                        >
                          <span className={cn("flex h-7 w-7 flex-none items-center justify-center rounded-md transition", active ? "bg-accent text-brand" : "bg-white/10 text-accent group-hover:bg-accent group-hover:text-brand")}>
                            <Icon size={16} />
                          </span>
                          <span className={cn("truncate", desktopCollapsed ? "md:hidden" : "")}>{item.href === "/booking" ? bookingFeatureNameForAccount(accountStatus) : item.label}</span>
                          {comingSoon && <span className={cn("ml-auto rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-black uppercase text-accent", desktopCollapsed ? "md:hidden" : "")}>Soon</span>}
                          {item.href === "/ask-coach" && askCoachUnreadCount > 0 && (
                            <span className={cn(
                              "ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-black text-brand shadow-sm",
                              desktopCollapsed ? "md:absolute md:right-1.5 md:top-1.5 md:h-4 md:min-w-4 md:px-1 md:text-[9px]" : ""
                            )}>
                              {askCoachUnreadCount > 9 ? "9+" : askCoachUnreadCount}
                            </span>
                          )}
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
