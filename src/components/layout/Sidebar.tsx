"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  BarChart3,
  Bell,
  BookOpen,
  ChevronDown,
  ClipboardList,
  Cpu,
  Crosshair,
  FileText,
  LayoutDashboard,
  Library,
  ListChecks,
  Megaphone,
  Receipt,
  Settings,
  Trophy,
  Users,
  WalletCards,
} from "lucide-react";
import Logo from "./Logo";
import { cn } from "@/lib/utils";

type Role = "student" | "instructor" | "admin";
type NavItem = { href: string; label: string; icon: any; roles?: Role[] };
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
      { href: "/homework", label: "Homework", icon: FileText },
      { href: "/attendance", label: "Attendance", icon: ClipboardList },
      { href: "/tournaments", label: "Tournaments", icon: Trophy },
      { href: "/leaderboard", label: "Leaderboards", icon: Trophy },
    ],
  },
  {
    id: "chess-tools",
    title: "Chess Tools",
    items: [
      { href: "/pgn", label: "PGN Library", icon: Library },
      { href: "/analysis", label: "Analysis Board", icon: ListChecks },
      { href: "/square-trainer", label: "Square Trainer", icon: Crosshair, roles: ["student", "admin"] },
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
    id: "administration",
    title: "Administration",
    roles: ["admin"],
    items: [
      { href: "/admin/users", label: "Users", icon: Users },
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

function canSee(role: Role, roles?: Role[]) {
  return !roles || roles.includes(role);
}

function isActive(pathname: string, item: NavItem) {
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export default function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const visibleSections = useMemo(
    () =>
      sections
        .filter((section) => canSee(role, section.roles))
        .map((section) => ({ ...section, items: section.items.filter((item) => canSee(role, item.roles)) }))
        .filter((section) => section.items.length > 0),
    [role]
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
    <aside className="hidden h-screen w-72 flex-shrink-0 border-r border-white/10 bg-[radial-gradient(circle_at_20%_0%,rgba(253,231,90,0.20),transparent_30%),linear-gradient(180deg,#5a1372_0%,#3a0c4a_58%,#1a0622_100%)] px-4 py-5 shadow-2xl shadow-brand-900/30 md:flex md:flex-col">
      <div className="mb-6 rounded-2xl border border-white/10 bg-white/10 px-3 py-4 shadow-lg shadow-black/10 backdrop-blur">
        <Logo />
      </div>
      <nav className="flex-1 space-y-2 overflow-y-auto pr-1">
        {visibleSections.map((section) => {
          const expanded = openSections.includes(section.id);
          const sectionActive = section.items.some((item) => isActive(pathname, item));
          return (
            <div key={section.id} className={cn("rounded-2xl border transition", sectionActive ? "border-accent/30 bg-white/10" : "border-transparent")}>
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.18em] transition",
                  sectionActive ? "text-accent" : "text-accent/80 hover:bg-white/10 hover:text-accent"
                )}
              >
                <span>{section.title}</span>
                <ChevronDown size={15} className={cn("transition", expanded ? "rotate-180" : "")} />
              </button>
              {expanded && (
                <ul className="space-y-1.5 px-1 pb-2">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(pathname, item);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={cn(
                            "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                            active ? "bg-white text-brand shadow-lg shadow-black/10" : "text-white/75 hover:bg-white/10 hover:text-white"
                          )}
                        >
                          <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg transition", active ? "bg-accent text-brand" : "bg-white/10 text-accent group-hover:bg-accent group-hover:text-brand")}>
                            <Icon size={16} />
                          </span>
                          <span>{item.label}</span>
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
      <div className="mt-5 rounded-2xl border border-white/10 bg-white/10 p-4 text-sm text-white/80">
        <div className="font-semibold text-white">Envision Academy</div>
        <div className="mt-1 text-xs leading-relaxed text-white/60">Premium chess tools, classes, PGNs, tournaments, and progress in one place.</div>
      </div>
    </aside>
  );
}
