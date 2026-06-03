"use client";
import { signOut } from "next-auth/react";
import { Bell } from "lucide-react";

export default function Topbar({ user }: { user: { name?: string | null; role: string } }) {
  return (
    <header className="flex items-center justify-between border-b border-ink-700 bg-ink-900/70 px-6 py-3 backdrop-blur">
      <div className="text-sm text-gray-400">
        Welcome back, <span className="text-accent font-semibold">{user.name}</span>
        <span className="ml-2 chip">{user.role}</span>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-ghost px-2" aria-label="Notifications"><Bell size={18} /></button>
        <button className="btn-outline" onClick={() => signOut({ callbackUrl: "/" })}>Sign out</button>
      </div>
    </header>
  );
}
