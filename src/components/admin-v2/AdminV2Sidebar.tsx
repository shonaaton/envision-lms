"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  DollarSign,
  FileText,
  LayoutDashboard,
  Library,
  MessageSquare,
  PlusCircle,
  Receipt,
  Settings,
  ShieldCheck,
  Trophy,
  Users,
  WalletCards,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; badge?: string };
type NavHub = { id: string; label: string; icon: any; items: NavItem[]; bottom?: boolean };

const hubs: NavHub[] = [
  {
    id: "operations",
    label: "Operations Hub",
    icon: Users,
    items: [
      { href: "/admin-v2/directory", label: "Directory" },
      { href: "/admin-v2/onboarding", label: "Onboarding", badge: "!" },
      { href: "/admin-v2/showcase", label: "Showcase" },
      { href: "/admin-v2/comms", label: "Comms & Logs" },
    ],
  },
  {
    id: "academics",
    label: "Academics",
    icon: BookOpen,
    items: [
      { href: "/admin-v2/academics", label: "Academics Hub" },
      { href: "/admin/courses", label: "Courses & Curriculum" },
      { href: "/admin/homework-templates", label: "Homework Templates" },
      { href: "/classrooms", label: "Classrooms" },
      { href: "/attendance", label: "Attendance" },
    ],
  },
  {
    id: "schedule",
    label: "Schedule & Events",
    icon: CalendarDays,
    items: [
      { href: "/admin-v2/calendar", label: "Unified Calendar" },
      { href: "/availability", label: "Available Times" },
      { href: "/tournaments", label: "Tournaments" },
    ],
  },
  {
    id: "financial",
    label: "Financial Hub",
    icon: WalletCards,
    items: [
      { href: "/fees", label: "Fees Dashboard" },
      { href: "/fees/fee-plans", label: "Fee Plans" },
      { href: "/fees/student-fees", label: "Student Billing & Credits" },
      { href: "/fees/invoices", label: "Invoices" },
      { href: "/fees/reports", label: "Reports" },
    ],
  },
  {
    id: "chess",
    label: "Chess Tools",
    icon: Trophy,
    items: [
      { href: "/pgn", label: "PGN Library" },
      { href: "/analysis", label: "Analysis Board" },
      { href: "/admin-v2/engine", label: "Chess Engine" },
      { href: "/ask-coach", label: "Ask Coach" },
      { href: "/leaderboard", label: "Leaderboard" },
    ],
  },
  {
    id: "system",
    label: "System & Settings",
    icon: Settings,
    bottom: true,
    items: [
      { href: "/admin/reports", label: "Reports Center" },
      { href: "/admin/notifications", label: "Notifications History" },
      { href: "/admin/feature-access", label: "Feature Access" },
      { href: "/admin/settings", label: "Academy Setup" },
    ],
  },
];

const quickActions = [
  { href: "/fees/invoices", label: "Create Invoice", icon: Receipt },
  { href: "/admin-v2/directory", label: "Add Student", icon: Users },
  { href: "/admin-v2/directory", label: "Create Batch", icon: ClipboardList },
  { href: "/admin-v2/comms", label: "Broadcast Announcement", icon: Bell },
];

export default function AdminV2Sidebar({ activeHref }: { activeHref: string }) {
  const [expanded, setExpanded] = useState(false);
  const [openHub, setOpenHub] = useState("");
  const [quickOpen, setQuickOpen] = useState(false);
  const activeHub = useMemo(() => hubs.find((hub) => hub.items.some((item) => activeHref === item.href || activeHref.startsWith(`${item.href}/`)))?.id || "operations", [activeHref]);
  const resolvedOpenHub = expanded ? openHub || activeHub : "";

  function renderHub(hub: NavHub) {
    const Icon = hub.icon;
    const active = hub.id === activeHub;
    const open = resolvedOpenHub === hub.id;
    return (
      <div key={hub.id}>
        <button
          onClick={() => setOpenHub(open ? "" : hub.id)}
          className={cn("flex h-10 w-full items-center gap-3 rounded-md px-2 text-sm font-bold transition", active ? "bg-brand text-white" : "text-slate-700 hover:bg-slate-100 hover:text-brand")}
        >
          <Icon size={20} className="shrink-0" />
          {expanded ? <span className="min-w-0 flex-1 truncate text-left">{hub.label}</span> : null}
          {expanded ? <ChevronDown size={15} className={cn("transition", open && "rotate-180")} /> : null}
        </button>
        {expanded && open ? (
          <div className="mt-1 space-y-1 pl-9 pr-1">
            {hub.items.map((item) => {
              const itemActive = activeHref === item.href || activeHref.startsWith(`${item.href}/`);
              return (
                <Link key={item.href} href={item.href} className={cn("flex min-h-8 items-center justify-between rounded-md px-2 py-1 text-sm font-semibold transition", itemActive ? "bg-brand/10 text-brand" : "text-slate-600 hover:bg-slate-50 hover:text-brand")}>
                  <span className="truncate">{item.label}</span>
                  {item.badge ? <span className="ml-2 rounded-full bg-accent px-1.5 text-[10px] font-black text-brand">{item.badge}</span> : null}
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <aside
      className={cn("fixed inset-y-0 left-0 z-40 hidden border-r border-slate-200 bg-white transition-all duration-300 lg:flex lg:flex-col", expanded ? "w-72" : "w-16")}
      onMouseEnter={() => {
        setExpanded(true);
        setOpenHub((current) => current || activeHub);
      }}
      onMouseLeave={() => {
        setExpanded(false);
        setQuickOpen(false);
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <div className="relative">
          <button onClick={() => setQuickOpen((value) => !value)} className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-accent px-2 font-black text-brand transition hover:brightness-95">
            <PlusCircle size={20} />
            {expanded ? <span>Quick Add</span> : null}
          </button>
          {expanded && quickOpen ? (
            <div className="absolute left-0 right-0 top-12 z-50 rounded-md border border-slate-200 bg-white p-2 shadow-xl">
              {quickActions.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={`${item.href}-${item.label}`} href={item.href} className="flex items-center gap-2 rounded-md px-2 py-2 text-sm font-semibold text-slate-700 hover:bg-brand/5 hover:text-brand">
                    <Icon size={16} /> {item.label}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>

        <Link href="/dashboard" className={cn("flex h-10 items-center gap-3 rounded-md px-2 text-sm font-bold transition", activeHref === "/dashboard" ? "bg-brand text-white" : "text-slate-700 hover:bg-slate-100 hover:text-brand")}>
          <LayoutDashboard size={20} className="shrink-0" />
          {expanded ? <span>Dashboard</span> : null}
        </Link>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pt-1">{hubs.filter((hub) => !hub.bottom).map(renderHub)}</div>
      </div>

      <div className="border-t border-slate-100 p-3">
        {hubs.filter((hub) => hub.bottom).map(renderHub)}
        {expanded ? (
          <div className="mt-3 grid grid-cols-4 gap-1 text-brand/70">
            <DollarSign size={15} />
            <BarChart3 size={15} />
            <FileText size={15} />
            <ShieldCheck size={15} />
          </div>
        ) : null}
      </div>
    </aside>
  );
}
