"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const rupees = (paise: number) => `₹${Math.round((paise || 0) / 100).toLocaleString("en-IN")}`;

export async function api<T = any>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: init?.json !== undefined ? { "Content-Type": "application/json" } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Something went wrong.");
  return data as T;
}

const TABS = [
  { href: "/bowbazar", label: "Overview", need: "view" },
  { href: "/bowbazar/attendance", label: "Attendance", need: "attendance" },
  { href: "/bowbazar/slots", label: "Slots", need: "view" },
  { href: "/bowbazar/students", label: "Students", need: "view" },
  { href: "/bowbazar/admissions", label: "Admissions", need: "students" },
  { href: "/bowbazar/changes", label: "Time changes", need: "students" },
  { href: "/bowbazar/messages", label: "Messages", need: "messages" },
  { href: "/bowbazar/exams", label: "Exams", need: "exams" },
  { href: "/bowbazar/achievements", label: "Achievements", need: "achievements" },
  { href: "/bowbazar/whatsapp", label: "WhatsApp", need: "whatsapp" },
  { href: "/bowbazar/activity", label: "Activity", need: "activity" },
  { href: "/bowbazar/fees", label: "Fees", need: "fees" },
  { href: "/bowbazar/users", label: "Users", need: "staff" },
  { href: "/bowbazar/access", label: "Feature access", need: "staff" },
  { href: "/bowbazar/settings", label: "Settings", need: "fees" },
];

export function BranchHeader({ title, subtitle, can, actions }: { title: string; subtitle?: string; can: string[]; actions?: ReactNode }) {
  const pathname = usePathname() || "";
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-wide text-brand">Bowbazar branch</div>
          <h1 className="text-2xl font-black text-slate-950">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <nav className="flex gap-1 overflow-x-auto rounded-lg border border-brand/10 bg-white p-1">
        {TABS.filter((tab) => can.includes(tab.need)).map((tab) => {
          const active = tab.href === "/bowbazar" ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-bold transition",
                active ? "bg-brand text-white" : "text-slate-600 hover:bg-brand-50 hover:text-brand"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function Drawer({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40" onClick={onClose}>
      <div className="flex h-full w-full max-w-xl flex-col bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-black text-slate-950">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-1", className)}>
      <span className="text-xs font-bold text-slate-600">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function Stat({ label, value, tone = "default", hint }: { label: string; value: ReactNode; tone?: "default" | "good" | "warn" | "bad"; hint?: string }) {
  return (
    <div className="rounded-lg border border-brand/10 bg-white p-4 shadow-sm">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div
        className={cn(
          "mt-1 text-2xl font-black",
          tone === "good" && "text-emerald-700",
          tone === "warn" && "text-amber-700",
          tone === "bad" && "text-red-700",
          tone === "default" && "text-slate-950"
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function ModeBadge({ mode }: { mode: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-black uppercase",
        mode === "online" ? "bg-sky-100 text-sky-800" : "bg-amber-100 text-amber-900"
      )}
    >
      {mode}
    </span>
  );
}

/** Shown once after an account is created or its password reset. */
export function CredentialsNote({ username, password, note }: { username: string; password: string; note?: string }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
      <div className="font-black">Login details</div>
      <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <span className="text-emerald-700">User ID</span>
        <span className="font-mono font-bold">{username}</span>
        <span className="text-emerald-700">Password</span>
        <span className="font-mono font-bold">{password}</span>
      </div>
      {note && <div className="mt-1 text-xs">{note}</div>}
      <button
        type="button"
        className="mt-2 text-xs font-bold text-emerald-800 underline"
        onClick={() => navigator.clipboard?.writeText(`User ID: ${username}\nPassword: ${password}\nLogin: ${window.location.origin}/login`)}
      >
        Copy for WhatsApp
      </button>
    </div>
  );
}

type PickerSlot = { id: string; label: string; mode: string; isActive: boolean; free: number };

/** Open slots with their free seats; a full slot can't be picked unless the student already sits in it. */
export function SlotPicker({
  slots,
  value,
  onChange,
  seatedIn = [],
}: {
  slots: PickerSlot[];
  value: string[];
  onChange: (value: string[]) => void;
  seatedIn?: string[];
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-bold text-slate-600">Slots</div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {slots.filter((slot) => slot.isActive).map((slot) => {
          const chosen = value.includes(slot.id);
          const full = slot.free === 0 && !seatedIn.includes(slot.id);
          return (
            <label
              key={slot.id}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm",
                chosen ? "border-brand bg-brand-50" : "border-slate-200",
                full && !chosen && "cursor-not-allowed opacity-50"
              )}
            >
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={chosen}
                  disabled={full && !chosen}
                  onChange={() => onChange(chosen ? value.filter((entry) => entry !== slot.id) : [...value, slot.id])}
                />
                <span className="font-semibold">{slot.label}</span>
                {slot.mode === "online" && <ModeBadge mode="online" />}
              </span>
              <span className={cn("text-xs font-bold", slot.free ? "text-emerald-700" : "text-red-700")}>{slot.free ? `${slot.free} free` : "Full"}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
