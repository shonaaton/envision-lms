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
    <aside className="hidden h-screen w-64 flex-shrink-0 border-r border-ink-700 bg-ink-900 px-4 py-6 md:flex md:flex-col">
      <Logo className="mb-8" />
      <nav className="flex-1 space-y-6 overflow-y-auto">
        {visibleGroups.map((g) => (
          <div key={g.title}>
            <div className="px-3 text-xs font-semibold uppercase tracking-wider text-gray-500">{g.title}</div>
            <ul className="mt-2 space-y-1">
              {g.items.map((it) => {
                const Icon = it.icon;
                const active = pathname === it.href || pathname.startsWith(it.href + "/");
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition",
                        active ? "bg-brand text-white" : "text-gray-300 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      <Icon size={16} />
                      <span>{it.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
