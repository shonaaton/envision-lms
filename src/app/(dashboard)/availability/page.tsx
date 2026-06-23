"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { CalendarDays, Clock3, Plus, Save, Trash2 } from "lucide-react";

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Slot = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
};

function blankSlot(): Slot {
  return { dayOfWeek: 1, startTime: "17:00", endTime: "18:00", slotMinutes: 60 };
}

export default function AvailabilityPage() {
  const { data: session } = useSession();
  const userId = (session?.user as any)?.id;
  const role = (session?.user as any)?.role;
  const [slots, setSlots] = useState<Slot[]>([]);
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [feePerSession, setFeePerSession] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/availability?instructor=${userId}`)
      .then((response) => response.json())
      .then((payload) => {
        setSlots(Array.isArray(payload.slots) ? payload.slots : []);
        setTimezone(payload.timezone || "Asia/Kolkata");
        setFeePerSession(Number(payload.feePerSession || 0));
      })
      .catch(() => toast.error("Could not load your available times."));
  }, [userId]);

  const grouped = useMemo(() => {
    return dayNames.map((day, dayOfWeek) => ({
      day,
      slots: slots.filter((slot) => Number(slot.dayOfWeek) === dayOfWeek),
    }));
  }, [slots]);

  function updateSlot(index: number, patch: Partial<Slot>) {
    setSlots((current) => current.map((slot, slotIndex) => (slotIndex === index ? { ...slot, ...patch } : slot)));
  }

  function removeSlot(index: number) {
    setSlots((current) => current.filter((_, slotIndex) => slotIndex !== index));
  }

  async function save() {
    setLoading(true);
    const response = await fetch("/api/availability", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instructor: userId,
        timezone,
        feePerSession,
        slots: slots.filter((slot) => slot.startTime && slot.endTime),
      }),
    });
    setLoading(false);
    if (!response.ok) return toast.error("Could not save available times.");
    toast.success("Available times saved");
  }

  if (role !== "instructor" && role !== "admin") {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-slate-700 shadow-sm">
        Available times are managed by coaches and administrators.
      </div>
    );
  }

  return (
    <div className="space-y-5 text-slate-950">
      <header className="flex flex-wrap items-end justify-between gap-3 rounded-[28px] border border-brand/10 bg-white p-5 shadow-[0_20px_50px_rgba(90,19,114,0.10)]">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">
            <CalendarDays size={14} /> Coach Availability
          </div>
          <h1 className="mt-2 text-3xl font-black text-brand">Available Times</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Add the regular times you are open for demo classes and credit-plan class requests. Demo requests still wait for admin approval.
          </p>
        </div>
        <button onClick={save} disabled={loading} className="btn-primary">
          <Save size={16} /> {loading ? "Saving..." : "Save Times"}
        </button>
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black">Weekly availability</h2>
              <p className="text-sm text-slate-500">Students will see these as clean booking choices.</p>
            </div>
            <button onClick={() => setSlots((current) => [...current, blankSlot()])} className="btn-outline">
              <Plus size={16} /> Add Time
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {slots.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                No available times added yet.
              </div>
            ) : (
              slots.map((slot, index) => (
                <div key={index} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr_120px_120px_120px_auto] md:items-end">
                  <label className="space-y-1">
                    <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">Day</span>
                    <select value={slot.dayOfWeek} onChange={(event) => updateSlot(index, { dayOfWeek: Number(event.target.value) })} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm">
                      {dayNames.map((day, dayOfWeek) => <option key={day} value={dayOfWeek}>{day}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">Start</span>
                    <input type="time" value={slot.startTime} onChange={(event) => updateSlot(index, { startTime: event.target.value })} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">End</span>
                    <input type="time" value={slot.endTime} onChange={(event) => updateSlot(index, { endTime: event.target.value })} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">Minutes</span>
                    <input type="number" min={15} step={15} value={slot.slotMinutes} onChange={(event) => updateSlot(index, { slotMinutes: Number(event.target.value) })} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" />
                  </label>
                  <button onClick={() => removeSlot(index)} className="inline-flex h-11 items-center justify-center rounded-xl border border-red-200 bg-white px-3 text-red-600">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-[24px] border border-brand/10 bg-white p-5 shadow-sm">
            <h3 className="flex items-center gap-2 font-black text-brand"><Clock3 size={18} /> Booking Rules</h3>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <p>Demo students can request these times, but admin must approve before the demo classroom is created.</p>
              <p>Credit-plan students can book from these times when credits are available. Credits are deducted only after attendance is completed.</p>
              <p>Monthly-plan classes remain on their fixed schedules.</p>
            </div>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
            <label className="space-y-1">
              <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">Timezone</span>
              <input value={timezone} onChange={(event) => setTimezone(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" />
            </label>
            <label className="mt-3 block space-y-1">
              <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">Optional Session Fee</span>
              <input type="number" value={feePerSession} onChange={(event) => setFeePerSession(Number(event.target.value))} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" />
            </label>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-white p-5">
            <h3 className="font-black text-slate-950">Current Week</h3>
            <div className="mt-3 space-y-2">
              {grouped.map((group) => (
                <div key={group.day} className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
                  <div className="font-bold text-slate-800">{group.day}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {group.slots.length ? group.slots.map((slot) => `${slot.startTime}-${slot.endTime}`).join(", ") : "No time set"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
