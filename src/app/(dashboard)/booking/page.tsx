"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, CheckCircle2, Clock3, Sparkles, UserRound } from "lucide-react";

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function nextDateForDay(dayOfWeek: number) {
  const now = new Date();
  const date = new Date(now);
  const diff = (dayOfWeek - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + diff);
  return date;
}

function buildDateTime(dayOfWeek: number, startTime: string) {
  const date = nextDateForDay(dayOfWeek);
  const [hours, minutes] = startTime.split(":").map(Number);
  date.setHours(hours || 0, minutes || 0, 0, 0);
  if (date.getTime() < Date.now()) date.setDate(date.getDate() + 7);
  return date;
}

export default function BookingPage() {
  const [coaches, setCoaches] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [selectedCoach, setSelectedCoach] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/availability").then((r) => r.json()).then((payload) => setCoaches(Array.isArray(payload) ? payload : []));
    fetch("/api/bookings").then((r) => r.json()).then((payload) => setBookings(Array.isArray(payload) ? payload : []));
  }, []);

  const slotOptions = useMemo(() => {
    const coachEntry = coaches.find((entry) => entry.coach?._id === selectedCoach);
    return (coachEntry?.availability?.slots || []).map((slot: any, index: number) => {
      const start = buildDateTime(slot.dayOfWeek, slot.startTime);
      const minutes = Number(slot.slotMinutes || 60);
      const end = new Date(start.getTime() + minutes * 60000);
      return {
        id: `${index}:${start.toISOString()}:${end.toISOString()}`,
        label: `${dayNames[slot.dayOfWeek]} • ${slot.startTime} • ${minutes} min`,
        start,
        end,
      };
    });
  }, [coaches, selectedCoach]);

  async function book() {
    const slot = slotOptions.find((item: any) => item.id === selectedSlot);
    if (!selectedCoach || !slot) return toast.error("Please choose a coach and available time.");
    setLoading(true);
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instructor: selectedCoach,
        startAt: slot.start.toISOString(),
        endAt: slot.end.toISOString(),
        bookingType: "credit_class",
        notes,
      }),
    });
    const payload = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return toast.error(payload.error || "Could not book this time.");
    toast.success(payload.approvalStatus === "pending_admin" ? "Request sent for admin approval" : "Class booked");
    setSelectedSlot("");
    setNotes("");
    fetch("/api/bookings").then((r) => r.json()).then((next) => setBookings(Array.isArray(next) ? next : []));
  }

  return (
    <div className="min-h-[calc(100vh-92px)] space-y-5 rounded-3xl bg-white/70 p-5 text-slate-950 shadow-xl shadow-brand/5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-amber-700">
            <Sparkles size={14} /> Academy Time Finder
          </div>
          <h1 className="mt-2 text-3xl font-black text-brand">Book Demo / Available Class</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">Demo requests wait for admin approval. Credit-plan students can use available coach time to request extra classes.</p>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-slate-950">Choose an available time</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Coach</span>
              <select value={selectedCoach} onChange={(event) => { setSelectedCoach(event.target.value); setSelectedSlot(""); }} className="h-12 w-full rounded-xl border border-slate-200 px-3 text-sm">
                <option value="">Select coach</option>
                {coaches.map((entry) => <option key={entry.coach?._id} value={entry.coach?._id}>{entry.coach?.name}</option>)}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Available Time</span>
              <select value={selectedSlot} onChange={(event) => setSelectedSlot(event.target.value)} className="h-12 w-full rounded-xl border border-slate-200 px-3 text-sm" disabled={!selectedCoach}>
                <option value="">Select time</option>
                {slotOptions.map((slot: any) => <option key={slot.id} value={slot.id}>{slot.label}</option>)}
              </select>
            </label>
          </div>
          <label className="mt-4 block space-y-2">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Message for academy</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-brand" placeholder="Mention preferred topic, goal, or anything the coach should know." />
          </label>
          <button onClick={book} disabled={loading} className="btn-primary mt-4">
            <CalendarDays size={16} /> {loading ? "Booking..." : "Request Booking"}
          </button>
        </div>

        <aside className="rounded-2xl border border-purple-100 bg-purple-50/80 p-5">
          <h3 className="font-black text-brand">How this works</h3>
          <div className="mt-4 space-y-3 text-sm text-slate-700">
            <Info icon={<UserRound size={16} />} title="Demo users" text="Your demo request is sent to admin first. Admin can confirm the coach and time before the demo classroom opens." />
            <Info icon={<CheckCircle2 size={16} />} title="Credit students" text="If you have a credit plan with credits left, available time can become a scheduled class. Credit is deducted after attendance." />
            <Info icon={<Clock3 size={16} />} title="Monthly students" text="Monthly-plan classes remain fixed. Reschedule/cancel requests should still go through admin approval." />
          </div>
        </aside>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-slate-950">Your Requests</h2>
        <div className="mt-4 grid gap-3">
          {bookings.map((booking) => (
            <div key={booking._id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div>
                <div className="font-bold text-slate-950">{booking.bookingType === "demo" ? "Demo Class" : "Booked Class"} with {booking.instructor?.name || "Coach"}</div>
                <div className="text-sm text-slate-500">{new Date(booking.startAt).toLocaleString("en-IN")}</div>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold capitalize text-brand">{booking.approvalStatus || booking.status}</span>
            </div>
          ))}
          {bookings.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">No booking requests yet.</div>}
        </div>
      </section>
    </div>
  );
}

function Info({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-xl bg-white p-3">
      <div className="flex items-center gap-2 font-bold text-slate-950">{icon}{title}</div>
      <p className="mt-1 leading-6 text-slate-600">{text}</p>
    </div>
  );
}
