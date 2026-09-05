"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
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
  GraduationCap,
  LayoutDashboard,
  Library,
  ListChecks,
  Megaphone,
  MessageSquare,
  MessageCircle,
  Receipt,
  Send,
  Settings,
  ShieldCheck,
  Trophy,
  Users,
  WalletCards,
  UserPlus,
  UserRound,
  Target,
  PanelLeftClose,
  PanelLeftOpen,
  PauseCircle,
  LogOut,
  X,
} from "lucide-react";
import Logo from "./Logo";
import { cn } from "@/lib/utils";
import { bookingFeatureNameForAccount } from "@/lib/bookingLabels";
import { isInactiveRestrictedPath } from "@/lib/inactiveAccess";

type Role = "student" | "instructor" | "admin" | "sub-admin";
type AccountStatus = "demo" | "enrolled" | "coach_applicant" | "approved" | "rejected";
type FeatureStatus = "enabled" | "disabled" | "testing" | "coming_soon";
type FeatureState = Record<string, { visible: boolean; status: FeatureStatus; permissions: string[] }>;
type NavItem = { href: string; label: string; icon: any; featureKey?: string; permission?: string; roles?: Role[]; demoOnly?: boolean; hideForDemo?: boolean; superAdminOnly?: boolean };
type NavSection = { id: string; title: string; items: NavItem[]; roles?: Role[]; superAdminOnly?: boolean };
type NotificationItem = {
  _id: string;
  type: string;
  title: string;
  message: string;
  readAt?: string;
  createdAt: string;
  metadata?: { href?: string; conversation?: string; message?: string; editedAt?: string };
};

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
      { href: "/availability", label: "Available Times", icon: CalendarDays, featureKey: "availableTimes", roles: ["instructor", "admin", "sub-admin"] },
      { href: "/booking", label: "Booking", icon: CalendarDays, featureKey: "booking", roles: ["student"] },
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
      { href: "/pgn", label: "PGN Library", icon: Library, featureKey: "pgnLibrary", roles: ["instructor", "admin", "sub-admin"] },
      { href: "/analysis", label: "Analysis Board", icon: ListChecks, featureKey: "analysisBoard", roles: ["student", "instructor", "admin", "sub-admin"] },
      { href: "/chess-profile", label: "My Chess Profile", icon: BarChart3, featureKey: "playerAnalytics", roles: ["student"] },
      { href: "/instructor/students", label: "My Students", icon: Users, featureKey: "playerAnalytics", permission: "view_assigned", roles: ["instructor"] },
      { href: "/admin/player-analytics", label: "Player Analytics", icon: BarChart3, featureKey: "playerAnalytics", permission: "view_all", roles: ["admin", "sub-admin"] },
      { href: "/play/tactics-trainer", label: "Tactics Trainer", icon: Target, featureKey: "tacticsTrainer", roles: ["student", "admin", "sub-admin"] },
      { href: "/play/king-hunt", label: "King Hunt", icon: Crown, featureKey: "kingHunt", roles: ["student", "admin", "sub-admin"] },
      { href: "/play/square-trainer", label: "Square Trainer", icon: Crosshair, featureKey: "squareTrainer", roles: ["student", "admin", "sub-admin"] },
      { href: "/play/computer", label: "Play vs Computer", icon: Cpu, featureKey: "playVsComputer", roles: ["student", "admin", "sub-admin"] },
    ],
  },
  {
    id: "fees-management",
    title: "Fees Management",
    roles: ["admin", "sub-admin"],
    items: [
      { href: "/fees", label: "Fee Dashboard", icon: Banknote, featureKey: "feeDashboard" },
      { href: "/fees/fee-plans", label: "Fee Plans", icon: FileText, featureKey: "feePlans" },
      { href: "/fees/student-fees", label: "Student Fees", icon: Users, featureKey: "studentFees" },
      { href: "/fees/credit-monitoring", label: "Credit Monitoring", icon: WalletCards, featureKey: "creditMonitoring" },
      { href: "/fees/reminders", label: "Fee Reminders", icon: Send, featureKey: "fees", permission: "view" },
      { href: "/fees/invoices", label: "Invoices", icon: Receipt, featureKey: "invoices" },
      { href: "/fees/reports", label: "Fee Reports", icon: BarChart3, featureKey: "feeReports" },
    ],
  },
  {
    id: "student-billing",
    title: "Billing",
    roles: ["student"],
    items: [
      { href: "/fees", label: "Credits & Payments", icon: WalletCards, featureKey: "feeDashboard" },
      { href: "/fees/credit-monitoring", label: "Credit Monitoring", icon: WalletCards, featureKey: "creditMonitoring" },
      { href: "/fees/credit-history", label: "Credit History", icon: WalletCards, featureKey: "studentFees" },
      { href: "/fees/invoices", label: "My Invoices", icon: Receipt, featureKey: "invoices" },
    ],
  },
  {
    id: "user-management",
    title: "User Management",
    roles: ["admin", "sub-admin"],
    items: [
      { href: "/admin/users", label: "Users", icon: Users, featureKey: "userManagement" },
      { href: "/admin/paused-students", label: "Paused Students", icon: PauseCircle, featureKey: "studentPause" },
      { href: "/admin/coach-applications", label: "Coach Applications", icon: UserPlus, featureKey: "onboarding" },
    ],
  },
  {
    id: "demo-center",
    title: "Demo Center",
    roles: ["admin", "sub-admin"],
    items: [
      { href: "/admin/demo-center", label: "Demo Management", icon: GraduationCap, featureKey: "onboarding" },
    ],
  },
  {
    id: "academic-setup",
    title: "Academic Setup",
    roles: ["admin", "sub-admin"],
    items: [
      { href: "/admin/courses", label: "Courses", icon: BookOpenCheck, featureKey: "courseManagement" },
      { href: "/admin/homework-templates", label: "HW Templates", icon: FileText, featureKey: "homeworkTemplates" },
    ],
  },
  {
    id: "engagement",
    title: "Engagement",
    roles: ["admin", "sub-admin"],
    items: [
      { href: "/admin/achievements", label: "Achievements", icon: Trophy, featureKey: "achievements" },
      { href: "/admin/activity-tracker", label: "Activity Tracker", icon: ActivitySquare, featureKey: "activityTracker" },
    ],
  },
  {
    id: "communications",
    title: "Communications",
    roles: ["admin", "sub-admin"],
    items: [
      { href: "/admin/announcements", label: "Announcements", icon: Megaphone, featureKey: "announcements" },
      { href: "/admin/notifications", label: "Notifications", icon: Bell, featureKey: "notifications" },
      { href: "/admin/whatsapp", label: "WhatsApp", icon: MessageCircle, featureKey: "whatsapp" },
    ],
  },
  {
    id: "analytics",
    title: "Analytics",
    roles: ["admin", "sub-admin"],
    items: [
      { href: "/admin/reports", label: "Reports Center", icon: BarChart3, featureKey: "reportsCenter" },
    ],
  },
  {
    id: "settings",
    title: "Settings",
    items: [
      { href: "/profile", label: "Account Settings", icon: UserRound, featureKey: "accountSettings" },
      { href: "/admin/settings", label: "Academy Setup", icon: Settings, featureKey: "academySettings", roles: ["admin", "sub-admin"] },
      { href: "/admin/feature-access", label: "Feature Access", icon: ShieldCheck, featureKey: "featureAccess", roles: ["admin"], superAdminOnly: true },
    ],
  },
];

function canSee(role: Role, accountStatus: AccountStatus | undefined, isActive: boolean | undefined, isPaused: boolean | undefined, isSuperAdmin: boolean | undefined, featureState: FeatureState | undefined, item: { href?: string; roles?: Role[]; demoOnly?: boolean; hideForDemo?: boolean; featureKey?: string; permission?: string; superAdminOnly?: boolean }) {
  const isDemo = accountStatus === "demo";
  // A paused student keeps their account but not their classes, so the same
  // links are hidden as for a deactivated account.
  if ((isActive === false || isPaused === true) && item.href && isInactiveRestrictedPath(item.href)) return false;
  if (item.superAdminOnly && !isSuperAdmin) return false;
  if (item.featureKey && featureState?.[item.featureKey] && !featureState[item.featureKey].visible) return false;
  if (item.featureKey && item.permission && featureState?.[item.featureKey] && !featureState[item.featureKey].permissions.includes(item.permission)) return false;
  if (item.demoOnly && !isDemo) return false;
  if (item.hideForDemo && isDemo) return false;
  if (isDemo) {
    const demoAllowed = ["/dashboard", "/profile", "/booking", "/play/square-trainer", "/play/tactics-trainer", "/play/king-hunt", "/play/computer"];
    if ("href" in item && typeof (item as any).href === "string" && !demoAllowed.includes((item as any).href)) return false;
  }
  return !item.roles || item.roles.includes(role);
}

function isActive(pathname: string, item: NavItem) {
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function notificationHref(item: NotificationItem) {
  if (item.metadata?.href) return item.metadata.href;
  if (item.metadata?.conversation) {
    const message = item.metadata.message ? `&message=${encodeURIComponent(String(item.metadata.message))}` : "";
    return `/ask-coach?conversation=${encodeURIComponent(String(item.metadata.conversation))}${message}`;
  }
  return "/admin/notifications";
}

export default function Sidebar({
  role,
  accountStatus,
  isSuperAdmin,
  featureState,
  hasCreditPlan = true,
  user,
  mobileOpen = false,
  desktopCollapsed = false,
  onToggleDesktop,
  onCloseMobile,
}: {
  role: Role;
  accountStatus?: AccountStatus;
  isSuperAdmin?: boolean;
  featureState?: FeatureState;
  hasCreditPlan?: boolean;
  user: { name?: string | null; role: string; isActive?: boolean; isPaused?: boolean };
  mobileOpen?: boolean;
  desktopCollapsed?: boolean;
  onToggleDesktop?: () => void;
  onCloseMobile?: () => void;
}) {
  const pathname = usePathname() || "";
  const [askCoachUnreadCount, setAskCoachUnreadCount] = useState(0);
  const [openNotifications, setOpenNotifications] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const visibleSections = useMemo(
    () =>
      sections
        .filter((section) => canSee(role, accountStatus, user.isActive, user.isPaused, isSuperAdmin, featureState, section))
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => {
            if (role === "student" && item.href === "/fees/credit-history" && !hasCreditPlan) return false;
            return canSee(role, accountStatus, user.isActive, user.isPaused, isSuperAdmin, featureState, item);
          }),
        }))
        .filter((section) => section.items.length > 0),
    [role, accountStatus, user.isActive, user.isPaused, isSuperAdmin, featureState, hasCreditPlan]
  );
  const activeSection = visibleSections.find((section) => section.items.some((item) => isActive(pathname, item)))?.id || "academy";
  const [openSection, setOpenSection] = useState(activeSection);

  async function loadNotifications() {
    const response = await fetch("/api/notifications", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return 0;
    const data = await response.json().catch(() => ({}));
    setNotifications(data.notifications || []);
    const nextUnreadCount = Number(data.unreadCount || 0);
    setUnreadCount(nextUnreadCount);
    return nextUnreadCount;
  }

  async function openBell() {
    const nextOpen = !openNotifications;
    setOpenNotifications(nextOpen);
    if (!nextOpen) return;
    const nextUnreadCount = await loadNotifications();
    if (nextUnreadCount > 0) {
      await fetch("/api/notifications", { method: "PATCH" }).catch(() => undefined);
      setUnreadCount(0);
    }
  }

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
    void loadNotifications();
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("sidebar-open-section");
      if (saved && visibleSections.some((section) => section.id === saved)) return setOpenSection(activeSection || saved);
    } catch {
      // Remembering sidebar state is optional.
    }
    setOpenSection(activeSection);
  }, [activeSection, visibleSections]);

  useEffect(() => {
    window.localStorage.setItem("sidebar-open-section", openSection);
  }, [openSection]);

  function toggleSection(id: string) {
    setOpenSection((current) => (current === id ? "" : id));
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
          "fixed inset-y-0 left-0 z-50 flex h-dvh w-[min(86vw,13rem)] flex-shrink-0 flex-col border-r border-brand-900/20 bg-[linear-gradient(180deg,#5a1372_0%,#3a0c4a_62%,#1a0622_100%)] px-2 py-3 shadow-2xl shadow-brand-900/25 transition-[width,transform] duration-300 ease-out will-change-transform md:sticky md:top-0 md:z-20 md:h-dvh md:translate-x-0",
          desktopCollapsed ? "md:w-[4.75rem]" : "md:w-[12rem]",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
      <div className={cn("mb-3 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.08] px-2 py-2 shadow-lg shadow-black/10 backdrop-blur", desktopCollapsed ? "md:justify-center md:px-1" : "")}>
        <div className={cn("min-w-0 flex-1", desktopCollapsed ? "md:hidden" : "")}><Logo /></div>
        <button
          type="button"
          onClick={onToggleDesktop}
          className="hidden h-8 w-8 flex-none place-items-center rounded-md bg-white/10 text-white transition hover:bg-accent hover:text-brand md:grid"
          aria-label={desktopCollapsed ? "Expand navigation" : "Collapse navigation"}
          title={desktopCollapsed ? "Expand navigation" : "Collapse navigation"}
        >
          {desktopCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
        <button
          type="button"
          onClick={onCloseMobile}
          className="grid h-8 w-8 flex-none place-items-center rounded-md bg-white/10 text-white transition hover:bg-accent hover:text-brand md:hidden"
          aria-label="Close navigation"
        >
          <X size={16} />
        </button>
      </div>
      <nav className="flex-1 space-y-1.5 overflow-y-auto pr-1" aria-label="Dashboard navigation">
        {visibleSections.map((section) => {
          const expanded = openSection === section.id;
          const sectionActive = section.items.some((item) => isActive(pathname, item));
          return (
            <div key={section.id} className={cn("rounded-lg border transition", sectionActive ? "border-accent/30 bg-white/[0.11]" : "border-transparent")}>
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                aria-expanded={expanded}
                title={desktopCollapsed ? section.title : undefined}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[9px] font-bold uppercase tracking-[0.12em] transition",
                  desktopCollapsed ? "md:justify-center md:px-2" : "",
                  sectionActive ? "text-accent" : "text-accent/70 hover:bg-white/10 hover:text-accent"
                )}
              >
                <span className={cn(desktopCollapsed ? "md:hidden" : "")}>{section.title}</span>
                <ChevronDown size={13} className={cn("transition", expanded ? "rotate-180" : "", desktopCollapsed ? "md:hidden" : "")} />
              </button>
              {expanded && (
                <ul className="space-y-1 px-1 pb-1.5">
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
                            "group relative flex min-h-8 items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] font-semibold transition",
                            desktopCollapsed ? "md:justify-center md:px-2" : "",
                            active ? "bg-white text-brand shadow-sm" : comingSoon ? "cursor-not-allowed text-white/60" : "text-white/92 hover:bg-white/12 hover:text-white"
                          )}
                          aria-disabled={comingSoon}
                        >
                          <span className={cn("flex h-6 w-6 flex-none items-center justify-center rounded-md transition", active ? "bg-accent text-brand" : comingSoon ? "bg-white/10 text-accent/70" : "bg-white/14 text-accent group-hover:bg-accent group-hover:text-brand")}>
                            <Icon size={15} />
                          </span>
                          <span className={cn("min-w-0 flex-1 truncate leading-5", active ? "text-brand" : comingSoon ? "text-white/60" : "text-white", desktopCollapsed ? "md:hidden" : "")}>
                            {item.href === "/booking" ? bookingFeatureNameForAccount(accountStatus) : item.label}
                          </span>
                          {comingSoon && <span className={cn("ml-auto inline-flex h-5 w-11 flex-none items-center justify-center rounded bg-accent px-1 text-[9px] font-black uppercase text-brand shadow-sm", desktopCollapsed ? "md:hidden" : "")}>Soon</span>}
                          {item.href === "/ask-coach" && askCoachUnreadCount > 0 && (
                            <span className={cn(
                              "ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-black text-brand shadow-sm",
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
      <div className="relative mt-4">
        <div className={cn("rounded-lg border border-white/10 bg-white/[0.08] p-2 text-sm text-white shadow-lg shadow-black/10 backdrop-blur", desktopCollapsed ? "md:p-1.5" : "")}>
          <div className={cn("flex items-center gap-2", desktopCollapsed ? "md:flex-col md:items-center" : "")}>
            <div className={cn("min-w-0 flex-1 rounded-md bg-white/10 px-2 py-1.5", desktopCollapsed ? "md:hidden" : "")}>
              <div className="truncate text-xs font-bold text-white">{user.name || "Player"}</div>
            </div>
            <div className={cn("flex flex-none items-center gap-2", desktopCollapsed ? "md:flex-col" : "")}>
              <button
                type="button"
                onClick={openBell}
                className="relative inline-flex h-8 w-8 items-center justify-center rounded-md bg-accent text-brand shadow-sm transition hover:bg-accent-300"
                aria-label="Notifications"
                aria-expanded={openNotifications}
                title="Notifications"
              >
                <Bell size={16} />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-black text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                className={cn("inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/10 text-white shadow-sm transition hover:bg-white/20", desktopCollapsed ? "md:inline-flex" : "md:hidden")}
                onClick={() => signOut({ callbackUrl: "/" })}
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
          <button
            type="button"
            className={cn("mt-2 hidden h-9 w-full items-center justify-center gap-2 rounded-lg bg-rose-600 text-xs font-bold text-white shadow-sm transition hover:bg-rose-700", desktopCollapsed ? "" : "sm:inline-flex")}
            onClick={() => signOut({ callbackUrl: "/" })}
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
        {openNotifications && (
          <div className={cn("absolute bottom-[calc(100%+0.75rem)] left-0 z-50 w-[min(360px,calc(100vw-1.5rem))] rounded-lg border border-brand/10 bg-white p-3 text-slate-950 shadow-2xl shadow-brand/20", desktopCollapsed ? "md:left-full md:bottom-0 md:ml-3" : "")}>
            <div className="mb-2 flex items-center justify-between gap-3 px-1">
              <div className="font-black text-brand">Notifications</div>
              <button type="button" onClick={loadNotifications} className="rounded-md px-2 py-1 text-xs font-bold text-brand/70 hover:bg-brand-50 hover:text-brand">Refresh</button>
            </div>
            <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
              {notifications.length === 0 && <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No notifications yet.</div>}
              {notifications.map((item) => (
                <a key={item._id} href={notificationHref(item)} className="block rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-brand/20 hover:bg-slate-50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-bold text-slate-950">{item.title}</div>
                    {!item.readAt && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand" />}
                  </div>
                  <div className="mt-1 text-sm leading-relaxed text-slate-600">{item.message}</div>
                  <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    {item.metadata?.editedAt ? `Edited ${new Date(item.metadata.editedAt).toLocaleString()}` : new Date(item.createdAt).toLocaleString()}
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
    </>
  );
}
