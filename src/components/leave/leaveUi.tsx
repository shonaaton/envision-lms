"use client";
import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { formatAcademyDateTime } from "@/lib/academyTime";

export const field = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100";
export const button = "inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-purple-800 disabled:cursor-not-allowed disabled:opacity-50";
export const secondary = "inline-flex items-center justify-center gap-2 rounded-lg border border-brand/20 bg-white px-3 py-2 text-sm font-semibold text-brand hover:bg-purple-50 disabled:opacity-50";
export const danger = "inline-flex items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50";

const statusTitles: Record<string, string> = { requested: "Waiting for approval", approved: "Approved", rejected: "Rejected", cancelled: "Cancelled", expired: "Closed undecided" };
const statusColors: Record<string, string> = {
  requested: "bg-amber-50 text-amber-800",
  approved: "bg-emerald-50 text-emerald-800",
  rejected: "bg-rose-50 text-rose-800",
  cancelled: "bg-slate-100 text-slate-600",
  expired: "bg-slate-100 text-slate-600",
};

export function StatusChip({ status }: { status: string }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusColors[status] || "bg-slate-100 text-slate-600"}`}>{statusTitles[status] || status}</span>;
}

export function TypeChip({ type }: { type: string }) {
  return <span className="rounded-full bg-purple-50 px-2.5 py-1 text-xs font-semibold text-brand">{type === "full_day" ? "Full day" : "Half day"}</span>;
}

/** "6:00 pm" in academy time. */
export function timeOnly(value: string | Date | null | undefined) {
  return value ? formatAcademyDateTime(value, { day: undefined, month: undefined, year: undefined }) : "";
}

export function dateTime(value: string | Date | null | undefined) {
  return value ? formatAcademyDateTime(value) : "";
}

export function Drawer({ open, title, description, onClose, busy, children }: { open: boolean; title: string; description?: string; onClose: () => void; busy?: boolean; children: ReactNode }) {
  return (
    <Dialog.Root open={open} onOpenChange={(value) => { if (!value && !busy) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed bottom-0 right-0 top-0 z-50 w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="text-xl font-black text-brand">{title}</Dialog.Title>
            <Dialog.Close disabled={busy} aria-label="Close" className="rounded-lg p-1 hover:bg-slate-100"><X size={20} /></Dialog.Close>
          </div>
          {description ? <Dialog.Description className="mt-2 text-sm text-slate-500">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
          <div className="mt-6">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export async function sendJson(url: string, method: string, body?: unknown) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Something went wrong.");
  return result;
}
