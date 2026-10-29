"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { shiftDateKey } from "@/lib/branch/rules";
import { cn } from "@/lib/utils";
import { CHANGE_STATUS, changeLine, type Change } from "./ChangeRequestClient";
import { BranchHeader, Drawer, Field, ModeBadge, api } from "./shared";
import type { Slot } from "./SlotsClient";

type StaffChange = Change & { studentId: string; studentName: string; requestedByName: string; decidedByName: string; decidedAt: string | null };
type Lists = { pending: StaffChange[]; upcoming: StaffChange[]; history: StaffChange[] };
type StudentLite = { id: string; name: string; status: string; slots: { id: string; label: string }[] };
type Option = { slotId: string; label: string; mode: string; date: string; free: number; past: boolean; holiday?: string };

const TABS = [
  { key: "pending", label: "Waiting" },
  { key: "upcoming", label: "Coming up" },
  { key: "history", label: "History" },
] as const;

const shortDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const day = (value: string | null) => (value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "");

export default function ChangesClient({ can, today }: { can: string[]; today: string }) {
  const [lists, setLists] = useState<Lists | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("pending");
  const [rejecting, setRejecting] = useState<StaffChange | null>(null);
  const [moving, setMoving] = useState(false);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      setLists(await api<Lists>("/api/bowbazar/changes"));
    } catch (error: any) {
      toast.error(error.message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(change: StaffChange, action: "approve" | "cancel") {
    if (action === "cancel" && !window.confirm(`Cancel ${change.studentName}'s move? They go back to their own class that day.`)) return;
    setBusy(change.id);
    try {
      await api(`/api/bowbazar/changes/${change.id}`, { method: "PATCH", json: { action } });
      toast.success(action === "approve" ? "Approved. The family has been told." : "Cancelled.");
      await load();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy("");
    }
  }

  const rows = lists ? lists[tab] : [];

  return (
    <div className="space-y-4">
      <BranchHeader
        title="Class time changes"
        subtitle="Families ask to move one week's class or to change slot for good. Approving checks for a free seat first."
        can={can}
        actions={
          <button type="button" className="btn-primary h-10" onClick={() => setMoving(true)}>
            <Plus size={16} /> Move a student
          </button>
        }
      />

      <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 text-sm font-bold">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setTab(entry.key)}
            className={cn("rounded-md px-3 py-1.5", tab === entry.key ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100")}
          >
            {entry.label}
            {lists && entry.key !== "history" && lists[entry.key].length > 0 && <span className="ml-1.5 opacity-80">{lists[entry.key].length}</span>}
          </button>
        ))}
      </div>

      <section className="overflow-hidden rounded-lg border border-brand/10 bg-white shadow-sm">
        {!lists ? (
          <div className="flex items-center gap-2 p-5 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading...</div>
        ) : !rows.length ? (
          <div className="p-8 text-center text-sm text-slate-500">
            {tab === "pending" ? "No requests waiting." : tab === "upcoming" ? "No one-week moves coming up." : "Nothing yet."}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((change) => (
              <article key={change.id} className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black text-slate-950">{change.studentName}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">{change.type === "week" ? "One week" : "Permanent"}</span>
                    {tab === "history" && (
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", CHANGE_STATUS[change.status]?.style)}>
                        {change.status === "approved" ? "Approved" : change.status === "rejected" ? "Turned down" : CHANGE_STATUS[change.status]?.label}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-slate-700">{changeLine(change)}</div>
                  <div className="text-xs text-slate-500">
                    {change.requestedByStaff ? `Made by ${change.requestedByName || "staff"}` : `Asked ${day(change.createdAt)}`}
                    {change.reason && ` · "${change.reason}"`}
                    {change.decidedByName && !change.requestedByStaff && ` · decided by ${change.decidedByName}`}
                    {change.decisionNote && ` · ${change.decisionNote}`}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {change.status === "pending" && (
                    <>
                      <button type="button" className="btn-outline h-9 px-3 text-sm text-red-700" onClick={() => setRejecting(change)}>
                        <X size={15} /> Not possible
                      </button>
                      <button type="button" className="btn-primary h-9 px-3 text-sm" disabled={busy === change.id} onClick={() => void act(change, "approve")}>
                        {busy === change.id ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Approve
                      </button>
                    </>
                  )}
                  {tab === "upcoming" && (
                    <button type="button" className="btn-outline h-9 px-3 text-sm" disabled={busy === change.id} onClick={() => void act(change, "cancel")}>
                      Cancel move
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {rejecting && <RejectDrawer change={rejecting} onClose={() => setRejecting(null)} onDone={() => { setRejecting(null); void load(); }} />}
      {moving && <MoveDrawer today={today} onClose={() => setMoving(false)} onDone={() => { setMoving(false); setTab("upcoming"); void load(); }} />}
    </div>
  );
}

function RejectDrawer({ change, onClose, onDone }: { change: StaffChange; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await api(`/api/bowbazar/changes/${change.id}`, { method: "PATCH", json: { action: "reject", note } });
      toast.success("The family has been told.");
      onDone();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Drawer
      title={`Can't move ${change.studentName}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-outline h-10" onClick={onClose}>Back</button>
          <button type="button" className="btn-primary h-10" disabled={saving || !note.trim()} onClick={() => void save()}>
            {saving && <Loader2 size={16} className="animate-spin" />} Send
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-600">{changeLine(change)}</p>
      <Field label="Why not? *" hint="The family sees this.">
        <textarea className="input min-h-[80px]" value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. That class is full that week; Sunday 11am has a seat." />
      </Field>
    </Drawer>
  );
}

function nextDates(dayOfWeek: number, today: string, count = 4) {
  const [y, m, d] = today.split("-").map(Number);
  const offset = (dayOfWeek - new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 7) % 7;
  return Array.from({ length: count }, (_, index) => shiftDateKey(today, offset + index * 7));
}

function MoveDrawer({ today, onClose, onDone }: { today: string; onClose: () => void; onDone: () => void }) {
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [studentId, setStudentId] = useState("");
  const [type, setType] = useState<"week" | "permanent">("week");
  const [fromSlot, setFromSlot] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toSlot, setToSlot] = useState("");
  const [reason, setReason] = useState("");
  const [options, setOptions] = useState<Option[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api<{ students: StudentLite[] }>("/api/bowbazar/students"), api<{ slots: Slot[] }>("/api/bowbazar/slots")])
      .then(([studentData, slotData]) => {
        setStudents(studentData.students.filter((student) => student.status === "active"));
        setSlots(slotData.slots);
      })
      .catch((error) => toast.error(error.message));
  }, []);

  const student = students.find((entry) => entry.id === studentId);
  const from = slots.find((slot) => slot.id === fromSlot);
  const dates = useMemo(() => (from ? nextDates(from.dayOfWeek, today) : []), [from, today]);

  useEffect(() => {
    setToSlot("");
    setOptions(null);
    if (!studentId || (type === "week" && !fromDate)) return;
    api<{ options: Option[] }>(`/api/bowbazar/changes/options?studentId=${studentId}&type=${type}${type === "week" ? `&fromDate=${fromDate}` : ""}`)
      .then((data) => setOptions(data.options))
      .catch((error) => toast.error(error.message));
  }, [studentId, type, fromDate]);

  async function save() {
    setSaving(true);
    try {
      await api("/api/bowbazar/changes", {
        method: "POST",
        json: { studentId, type, fromSlot: fromSlot || undefined, fromDate: type === "week" ? fromDate : undefined, toSlot, reason },
      });
      toast.success(type === "week" ? "Moved for that week. The family has been told." : "Class time changed. The family has been told.");
      onDone();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      title="Move a student"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-outline h-10" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary h-10" disabled={saving || !toSlot || (type === "week" && !fromDate)} onClick={() => void save()}>
            {saving && <Loader2 size={16} className="animate-spin" />} Move
          </button>
        </>
      }
    >
      <Field label="Student">
        <select
          className="input"
          value={studentId}
          onChange={(event) => {
            const next = students.find((entry) => entry.id === event.target.value);
            setStudentId(event.target.value);
            setFromSlot(next?.slots[0]?.id || "");
            setFromDate("");
          }}
        >
          <option value="">Pick a student...</option>
          {students.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name} {entry.slots.length ? `(${entry.slots.map((slot) => slot.label).join(", ")})` : "(no slot)"}
            </option>
          ))}
        </select>
      </Field>
      {student && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {(["week", "permanent"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setType(value);
                  setFromDate("");
                }}
                className={cn("rounded-lg border p-2.5 text-left text-sm font-bold", type === value ? "border-brand bg-brand-50" : "border-slate-200")}
              >
                {value === "week" ? "Just one week" : "From now on"}
              </button>
            ))}
          </div>
          <Field label={type === "week" ? "Class they'll miss" : "Class time they give up"}>
            <select className="input" value={fromSlot} onChange={(event) => { setFromSlot(event.target.value); setFromDate(""); }}>
              {type === "permanent" && <option value="">None: add a class time</option>}
              {student.slots.map((slot) => (
                <option key={slot.id} value={slot.id}>{slot.label}</option>
              ))}
            </select>
          </Field>
          {type === "week" && from && (
            <div className="flex flex-wrap gap-2">
              {dates.map((date) => (
                <button
                  key={date}
                  type="button"
                  onClick={() => setFromDate(date)}
                  className={cn("rounded-lg border px-3 py-1.5 text-sm font-bold", fromDate === date ? "border-brand bg-brand text-white" : "border-slate-200 text-slate-700")}
                >
                  {shortDate(date)}
                </button>
              ))}
            </div>
          )}
          {(type === "permanent" || fromDate) && (
            <div className="space-y-1">
              <div className="text-xs font-bold text-slate-600">{type === "week" ? "Class that week instead" : "New class time"}</div>
              {!options ? (
                <div className="text-sm text-slate-500">Checking seats...</div>
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
                          blocked && "cursor-not-allowed opacity-50"
                        )}
                      >
                        <span>
                          <span className="font-semibold">{option.label}</span>
                          {option.date && <span className="block text-xs text-slate-500">{shortDate(option.date)}</span>}
                        </span>
                        <span className="flex items-center gap-1.5">
                          {option.mode === "online" && <ModeBadge mode="online" />}
                          <span className={cn("text-xs font-bold", option.past ? "text-slate-400" : option.free ? "text-emerald-700" : "text-red-700")}>
                            {option.past ? "Over" : option.holiday ? "Closed" : option.free ? `${option.free} free` : "Full"}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <Field label="Note" hint="Optional; kept with the change">
            <input className="input" value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
        </>
      )}
    </Drawer>
  );
}
