"use client";
import { signOut } from "next-auth/react";
import { Bell, LogOut, Sparkles } from "lucide-react";

export default function Topbar({ user }: { user: { name?: string | null; role: string } }) {
  return (
    <header className="sticky top-0 z-30 border-b border-brand/10 bg-white/82 px-4 py-3 shadow-sm shadow-brand-900/5 backdrop-blur-xl sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-brand/70">
            <Sparkles size={14} className="text-accent-500" />
            Academy Workspace
          </div>
          <div className="mt-1 truncate text-sm text-slate-600">
            Welcome back, <span className="font-semibold text-brand">{user.name || "Player"}</span>
            <span className="ml-2 chip capitalize">{user.role}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-brand shadow-sm ring-1 ring-accent-600/20 transition hover:-translate-y-0.5 hover:shadow-md" aria-label="Notifications">
            <Bell size={18} />
          </button>
          <button className="btn-outline hidden sm:inline-flex" onClick={() => signOut({ callbackUrl: "/" })}>
            <LogOut size={16} /> Sign out
          </button>
          <button className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-brand/15 bg-white text-brand shadow-sm sm:hidden" onClick={() => signOut({ callbackUrl: "/" })} aria-label="Sign out">
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </header>
  );
}
