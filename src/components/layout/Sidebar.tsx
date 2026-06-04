"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, BookOpen, FileText, CalendarCheck, ClipboardList,
  Library, Cpu, Trophy, ListChecks, Banknote, Receipt, Settings, Megaphone, Bell,
  WalletCards, BarChart3,
} from "lucide-react";
import Logo from "./Logo";
import { cn } from "@/lib/utils";

const groups = [
  {
    title: "Academy",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/classrooms", label: "Classrooms", icon: BookOpen },
      { href: "/homework", label: "Homework", icon: FileText },
      { href: "/attendance", label: "Attendance", icon: ClipboardList },
      { href: "/booking", label: "Self Booking", icon: CalendarCheck },
      { href: "/tournaments", label: "Tournaments", icon: Trophy },
      { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
    ],
  },
  {
    title: "Chess Tools",
    items: [
      { href: "/pgn", label: "PGN Library", icon: Library },
      { href: "/analysis", label: "Analysis Board", icon: ListChecks },
      { href: "/play/computer", label: "Play vs Computer", icon: Cpu },
    ],
  },
  {
    title: "Billing",
    items: [
      { href: "/fees", label: "Fees Dashboard", icon: Banknote },
      { href: "/fees/fee-plans", label: "Fee Plans", icon: FileText },
      { href: "/fees/student-fees", label: "Student Fees", icon: Users },
      { href: "/fees/credit-monitoring", label: "Credit Monitoring", icon: WalletCards },
      { href: "/fees/invoices", label: "Invoices", icon: Receipt },
      { href: "/fees/reports", label: "Fee Reports", icon: BarChart3 },
    ],
  },
  {
    title: "Admin",
    items: [
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/announcements", label: "Announcements", icon: Megaphone },
      { href: "/admin/notifications", label: "Notifications", icon: Bell },
      { href: "/admin/settings", label: "Settings", icon: Settings },
    ],
  },
];

export default function Sidebar({ role }: { role: "student" | "instructor" | "admin" }) {
  const pathname = usePathname();
  const visibleGroups = groups.filter((g) => g.title !== "Admin" || role === "admin");
  return (
    <aside className="hidden h-screen w-72 flex-shrink-0 border-r border-white/10 bg-[radial-gradient(circle_at_20%_0%,rgba(253,231,90,0.20),transparent_30%),linear-gradient(180deg,#5a1372_0%,#3a0c4a_58%,#1a0622_100%)] px-4 py-5 shadow-2xl shadow-brand-900/30 md:flex md:flex-col">
      <div className="mb-6 rounded-2xl border border-white/10 bg-white/10 px-3 py-4 shadow-lg shadow-black/10 backdrop-blur">
        <Logo />
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto pr-1">
        {visibleGroups.map((g) => (
          <div key={g.title}>
            <div className="px-3 text-[11px] font-bold uppercase tracking-[0.18em] text-accent/80">{g.title}</div>
            <ul className="mt-2 space-y-1.5">
              {g.items.map((it) => {
                const Icon = it.icon;
                const active = pathname === it.href || pathname.startsWith(it.href + "/");
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      className={cn(
                        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                        active
                          ? "bg-white text-brand shadow-lg shadow-black/10"
                          : "text-white/75 hover:bg-white/10 hover:text-white"
                      )}
                    >
                      <span className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg transition",
                        active ? "bg-accent text-brand" : "bg-white/10 text-accent group-hover:bg-accent group-hover:text-brand"
                      )}>
                        <Icon size={16} />
                      </span>
                      <span>{it.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="mt-5 rounded-2xl border border-white/10 bg-white/10 p-4 text-sm text-white/80">
        <div className="font-semibold text-white">Envision Academy</div>
        <div className="mt-1 text-xs leading-relaxed text-white/60">Premium chess tools, classes, PGNs, tournaments, and progress in one place.</div>
      </div>
    </aside>
  );
}
