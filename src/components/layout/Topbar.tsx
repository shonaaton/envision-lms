"use client";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { Bell, LogOut, Sparkles } from "lucide-react";

type NotificationItem = {
  _id: string;
  type: string;
  title: string;
  message: string;
  readAt?: string;
  createdAt: string;
  metadata?: { href?: string };
};

export default function Topbar({ user }: { user: { name?: string | null; role: string } }) {
  const [openNotifications, setOpenNotifications] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  async function loadNotifications() {
    const response = await fetch("/api/notifications");
    if (!response.ok) return;
    const data = await response.json();
    setNotifications(data.notifications || []);
    setUnreadCount(data.unreadCount || 0);
  }

  async function openBell() {
    const nextOpen = !openNotifications;
    setOpenNotifications(nextOpen);
    if (!nextOpen) return;
    await loadNotifications();
    if (unreadCount > 0) {
      await fetch("/api/notifications", { method: "PATCH" });
      setUnreadCount(0);
    }
  }

  useEffect(() => {
    loadNotifications();
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-brand/10 bg-white/82 px-4 py-2 shadow-sm shadow-brand-900/5 backdrop-blur-xl sm:px-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-brand/70">
            <Sparkles size={14} className="text-accent-500" />
            Academy Workspace
          </div>
          <div className="mt-0.5 truncate text-sm text-slate-600">
            Welcome back, <span className="font-semibold text-brand">{user.name || "Player"}</span>
            <span className="ml-2 chip capitalize">{user.role}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative">
            <button onClick={openBell} className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-brand shadow-sm ring-1 ring-accent-600/20 transition hover:-translate-y-0.5 hover:shadow-md" aria-label="Notifications">
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-black text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
            {openNotifications && (
              <div className="absolute right-0 top-12 z-50 w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-brand/10 bg-white p-3 shadow-2xl shadow-brand/20">
                <div className="mb-2 flex items-center justify-between gap-3 px-1">
                  <div className="font-black text-brand">Notifications</div>
                  <button onClick={loadNotifications} className="text-xs font-bold text-brand/70 hover:text-brand">Refresh</button>
                </div>
                <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                  {notifications.length === 0 && <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No notifications yet.</div>}
                  {notifications.map((item) => (
                    <a key={item._id} href={item.metadata?.href || "#"} className="block rounded-xl border border-slate-200 bg-white p-3 shadow-sm hover:border-brand/20 hover:bg-slate-50">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-bold text-slate-950">{item.title}</div>
                        {!item.readAt && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand" />}
                      </div>
                      <div className="mt-1 text-sm leading-relaxed text-slate-600">{item.message}</div>
                      <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                        {new Date(item.createdAt).toLocaleString()}
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
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
