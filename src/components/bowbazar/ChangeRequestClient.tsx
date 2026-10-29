"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarClock, Loader2, Repeat } from "lucide-react";
import { toast } from "sonner";
import { shiftDateKey } from "@/lib/branch/rules";
import { cn } from "@/lib/utils";
import { ModeBadge, api } from "./shared";

type MySlot = { id: string; label: string; dayOfWeek: number; mode: string };
type Option = { slotId: string; label: string; mode: string; date: string; free: number; past: boolean; holiday?: string };
export type Change = {
  id: string;
  type: "week" | "permanent";
  fromLabel: string;
  toLabel: string;
  fromDate: string;
  toDate: string;
  reason: string;
  status: string;
  requestedByStaff: boolean;
  decisionNote: string;
  createdAt: string;
};

const shortDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function changeLine(change: Pick<Change, "type" | "fromLabel" | "toLabel" | "fromDate" | "toDate">) {
  if (change.type === "week") return `${change.fromLabel} on ${shortDate(change.fromDate)} → ${change.toLabel} on ${shortDate(change.toDate)}`;
  return change.fromLabel ? `${change.fromLabel} → ${change.toLabel}, from now on` : `${change.toLabel} added, from now on`;
}

export const CHANGE_STATUS: Record<string, { label: string; style: string }> = {
  pending: { label: "Waiting for the centre", style: "bg-amber-100 text-amber-900" },
  approved: { label: "Confirmed", style: "bg-emerald-100 text-emerald-800" },
  rejected: { label: "Not possible", style: "bg-red-100 text-red-800" },
  cancelled: { label: "Cancelled", style: "bg-slate-200 text-slate-700" },
};

/** The next few dates a slot meets, from today. */
function nextDates(dayOfWeek: number, today: string, count = 4) {
  const [y, m, d] = today.split("-").map(Number);
  const offset = (dayOfWeek - new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 7) % 7;
  return Array.from({ length: count }, (_, index) => shiftDateKey(today, offset + index * 7));
}

export default function ChangeRequestClient({
  mySlots,
  initialChanges,
  today,
  active,
}: {
  mySlots: MySlot[];
  initialChanges: Change[];
  today: string;
  active: boolean;
}) {
  const [changes, setChanges] = useState(initialChanges);
  const [type, setType] = useState<"week" | "permanent">("week");
  const [fromSlot, setFromSlot] = useState(mySlots[0]?.id || "");
  const [fromDate, setFromDate] = useState("");
  const [toSlot, setToSlot] = useState("");
  const [reason, setReason] = useState("");
  const [options, setOptions] = useState<Option[] | null>(null);
  const [busy, setBusy] = useState(false);

  const from = mySlots.find((slot) => slot.id === fromSlot);
  const dates = useMemo(() => (from ? nextDates(from.dayOfWeek, today) : []), [from, today]);

  useEffect(() => {
    setToSlot("");
    if (type === "week" && !fromDate) {
      setOptions(null);
      return;
    }
    setOptions(null);
    api<{ options: Option[] }>(`/api/bowbazar/me/changes/options?type=${type}${type === "week" ? `&fromDate=${fromDate}` : ""}`)
      .then((data) => setOptions(data.options))
      .catch((error) => toast.error(error.message));
  }, [type, fromDate]);

  async function reload() {
    const data = await api<{ changes: Change[] }>("/api/bowbazar/me/changes");
    setChanges(data.changes);
  }

  async function submit() {
    setBusy(true);
    try {
      await api("/api/bowbazar/me/changes", {
        method: "POST",
        json: { type, fromSlot: fromSlot || undefined, fromDate: type === "week" ? fromDate : undefined, toSlot, reason },
      });
      toast.success("Sent to the centre. You'll see their answer here.");
      setToSlot("");
      setReason("");
      setFromDate("");
      await reload();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(change: Change) {
    try {
      await api(`/api/bowbazar/me/changes/${change.id}`, { method: "DELETE" });
      await reload();
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  const canSend = Boolean(toSlot && reason.trim() && (type === "permanent" || (fromSlot && fromDate)));

  return (
    <div className="space-y-4">
      <Link href="/bowbazar/me" className="inline-flex items-center gap-1 text-sm font-bold text-brand hover:underline">
        <ArrowLeft size={16} /> My class
      </Link>
      <section className="rounded-lg border border-brand/10 bg-white p-5 shadow-sm">
        <h1 className="flex items-center gap-2 text-xl font-black text-slate-950">
          <Repeat size={20} className="text-brand" /> Change my class time
        </h1>
        <p className="mt-1 text-sm text-slate-500">Ask the centre to move one week&apos;s class, or to change your class time for good. Only classes with a free seat are shown.</p>

        {!active ? (
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900">Your classes are on hold. Contact the centre to start again.</p>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {(["week", "permanent"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setType(value);
                    setFromDate("");
                  }}
                  className={cn(
                    "rounded-lg border p-3 text-left text-sm",
                    type === value ? "border-brand bg-brand-50 ring-2 ring-brand/20" : "border-slate-200 hover:border-brand/40"
                  )}
                >
                  <div className="font-black text-slate-950">{value === "week" ? "Just one week" : "From now on"}</div>
                  <div className="text-xs text-slate-500">{value === "week" ? "Miss one class, come to another that week" : "Change your regular class time"}</div>
                </button>
              ))}
            </div>

            <label className="block space-y-1">
              <span className="text-sm font-bold text-slate-700">{type === "week" ? "Which class will you miss?" : "Which class time do you want to give up?"}</span>
              <select className="input" value={fromSlot} onChange={(event) => { setFromSlot(event.target.value); setFromDate(""); }}>
                {type === "permanent" && <option value="">{mySlots.length ? "None: add another class time" : "I have no class time yet"}</option>}
                {mySlots.map((slot) => (
                  <option key={slot.id} value={slot.id}>{slot.label}</option>
                ))}
              </select>
            </label>

            {type === "week" && from && (
              <div className="space-y-1">
                <span className="text-sm font-bold text-slate-700">On which date?</span>
                <div className="flex flex-wrap gap-2">
                  {dates.map((date) => (
                    <button
                      key={date}
                      type="button"
                      onClick={() => setFromDate(date)}
                      className={cn("rounded-lg border px-3 py-2 text-sm font-bold", fromDate === date ? "border-brand bg-brand text-white" : "border-slate-200 text-slate-700 hover:border-brand/40")}
                    >
                      {shortDate(date)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(type === "permanent" || fromDate) && (
              <div className="space-y-1">
                <span className="text-sm font-bold text-slate-700">{type === "week" ? "Which class that week instead?" : "Which class time instead?"}</span>
                {!options ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Checking free seats...</div>
                ) : !options.length ? (
                  <p className="text-sm text-slate-500">There are no other class times.</p>
                ) : (
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {options.map((option) => {
                      const blocked = option.free < 1 || option.past;
                      return (
                        <button
                          key={option.slotId}
                          type="button"
                          disabled={blocked}
                          onClick={() => setToSlot(option.slotId)}
                          className={cn(
                            "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm",
                            toSlot === option.slotId ? "border-brand bg-brand-50" : "border-slate-200",
                            blocked ? "cursor-not-allowed opacity-50" : "hover:border-brand/40"
                          )}
                        >
                          <span>
                            <span className="font-bold text-slate-900">{option.label}</span>
                            {option.date && <span className="block text-xs text-slate-500">{shortDate(option.date)}</span>}
                          </span>
                          <span className="flex items-center gap-1.5">
                            {option.mode === "online" && <ModeBadge mode="online" />}
                            <span className={cn("text-xs font-bold", option.past ? "text-slate-400" : option.free ? "text-emerald-700" : "text-red-700")}>
                              {option.past ? "Already over" : option.holiday ? "Closed" : option.free ? `${option.free} free` : "Full"}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <label className="block space-y-1">
              <span className="text-sm font-bold text-slate-700">Why?</span>
              <textarea className="input min-h-[70px]" maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. School exam that day" />
            </label>

            <button type="button" className="btn-primary h-11 w-full" disabled={busy || !canSend} onClick={() => void submit()}>
              {busy && <Loader2 size={16} className="animate-spin" />} Ask the centre <ArrowRight size={16} />
            </button>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-brand/10 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-base font-black text-slate-950">
          <CalendarClock size={18} className="text-brand" /> My requests
        </h2>
        {!changes.length ? (
          <p className="mt-2 text-sm text-slate-500">No requests yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {changes.map((change) => (
              <li key={change.id} className="space-y-1 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-900">{changeLine(change)}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", CHANGE_STATUS[change.status]?.style)}>
                    {change.requestedByStaff && change.status === "approved" ? "Made by the centre" : CHANGE_STATUS[change.status]?.label}
                  </span>
                </div>
                {change.decisionNote && <div className="text-xs text-slate-600">Centre: {change.decisionNote}</div>}
                {change.status === "pending" && (
                  <button type="button" className="text-xs font-bold text-red-700 hover:underline" onClick={() => void withdraw(change)}>
                    Withdraw
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
