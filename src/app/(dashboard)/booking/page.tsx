"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { CalendarDays, CheckCircle2, Clock3, LockKeyhole, Sparkles, UserRound } from "lucide-react";
import { nextOccurrenceForWeeklySlot } from "@/lib/bookingAvailability";
import { bookingFeatureNameForAccount, bookingFeatureNameForType, isDemoBookingAccount } from "@/lib/bookingLabels";
import { trackMetaSchedule } from "@/lib/metaPixel";
import { inactiveStudentMessage } from "@/lib/studentStatus";

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type CoachAvailabilityEntry = {
  coach?: { _id?: string; name?: string };
  availability?: {
    timezone?: string;
    slots?: Array<{ dayOfWeek: number; startTime: string; endTime?: string; slotMinutes?: number }>;
  };
};

type SlotOption = {
  id: string;
  label: string;
  coachLabel: string;
  start: Date;
  end: Date;
};

export default function BookingPage() {
  const { data: session } = useSession();
  const accountStatus = (session?.user as any)?.accountStatus as string | undefined;
  const isInactiveStudent = (session?.user as any)?.role === "student" && (session?.user as any)?.isActive === false;
  const isDemoStudent = isDemoBookingAccount(accountStatus);
  const featureName = bookingFeatureNameForAccount(accountStatus);
  const [coaches, setCoaches] = useState<CoachAvailabilityEntry[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [selectedCoach, setSelectedCoach] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/availability", { cache: "no-store" }).then((r) => r.json()).then((payload) => setCoaches(Array.isArray(payload) ? payload : []));
    fetch("/api/bookings", { cache: "no-store" }).then((r) => r.json()).then((payload) => setBookings(Array.isArray(payload) ? payload : []));
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata");
  }, []);

  const slotOptions = useMemo<SlotOption[]>(() => {
    const coachEntry = coaches.find((entry) => entry.coach?._id === selectedCoach);
    const coachTimeZone = String(coachEntry?.availability?.timezone || "Asia/Kolkata");
    return (coachEntry?.availability?.slots || [])
      .map((slot, index) => {
        const start = nextOccurrenceForWeeklySlot(
          {
            dayOfWeek: Number(slot.dayOfWeek),
            startTime: String(slot.startTime || ""),
            endTime: String(slot.endTime || ""),
            slotMinutes: Number(slot.slotMinutes || 60),
          },
          coachTimeZone
        );
        if (!start) return null;
        const minutes = Number(slot.slotMinutes || 60);
        const end = new Date(start.getTime() + minutes * 60000);
        return {
          id: `${index}:${start.toISOString()}:${end.toISOString()}`,
          label: `${new Intl.DateTimeFormat(undefined, {
            weekday: "long",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }).format(start)} - ${minutes} min`,
          coachLabel: `${dayNames[slot.dayOfWeek]} - ${slot.startTime} (${coachTimeZone})`,
          start,
          end,
        };
      })
      .filter((slot): slot is SlotOption => Boolean(slot));
  }, [coaches, selectedCoach]);

  async function book() {
    if (isDemoStudent) {
      if (!preferredDate || !preferredTime || !timezone) return toast.error("Please choose your preferred date, time, and timezone.");
      setLoading(true);
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferredDate,
          preferredTime,
          timezone,
          bookingType: "demo",
          notes,
          idempotencyKey: `demo-${preferredDate}-${preferredTime}-${timezone}`,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      setLoading(false);
      if (!res.ok) return toast.error(payload.error || "Could not request this demo time.");
      trackMetaSchedule(payload.metaEventId, payload._id);
      toast.success("Demo request sent for academy review");
      setPreferredDate("");
      setPreferredTime("");
      setNotes("");
      fetch("/api/bookings", { cache: "no-store" }).then((r) => r.json()).then((next) => setBookings(Array.isArray(next) ? next : []));
      return;
    }
    const slot = slotOptions.find((item) => item.id === selectedSlot);
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
    toast.success(
      payload.approvalStatus === "pending_admin"
        ? "Demo booking sent for admin approval"
        : payload.status === "confirmed"
          ? "Class booking confirmed"
          : "Class booking sent to your coach"
    );
    setSelectedSlot("");
    setNotes("");
    fetch("/api/bookings", { cache: "no-store" }).then((r) => r.json()).then((next) => setBookings(Array.isArray(next) ? next : []));
  }

  return (
    <div className="min-h-[calc(100vh-92px)] space-y-4 rounded-lg bg-white/70 p-3 text-slate-950 shadow-xl shadow-brand/5 sm:space-y-5 sm:p-5">
      {isInactiveStudent ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-center gap-2 font-black text-amber-900"><LockKeyhole size={18} /> Booking paused</div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-amber-800">{inactiveStudentMessage}</p>
        </section>
      ) : null}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-amber-700">
            <Sparkles size={14} /> Academy Time Finder
          </div>
          <h1 className="mt-2 text-2xl font-black text-brand sm:text-3xl">{featureName}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            {isDemoStudent
              ? "Choose your preferred demo time. The academy team will assign the coach after review."
              : "Choose a coach and send your class booking request using available academy time."}
          </p>
        </div>
      </header>

      {!isInactiveStudent && <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-lg font-black text-slate-950">{isDemoStudent ? "Request Demo Class" : "Choose an available time"}</h2>
          {isDemoStudent ? (
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Preferred Date</span>
                <input value={preferredDate} onChange={(event) => setPreferredDate(event.target.value)} type="date" min={new Date().toISOString().slice(0, 10)} className="h-12 w-full rounded-lg border border-slate-200 px-3 text-sm" />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Preferred Time</span>
                <input value={preferredTime} onChange={(event) => setPreferredTime(event.target.value)} type="time" className="h-12 w-full rounded-lg border border-slate-200 px-3 text-sm" />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Timezone</span>
                <input value={timezone} onChange={(event) => setTimezone(event.target.value)} className="h-12 w-full rounded-lg border border-slate-200 px-3 text-sm" />
              </label>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Coach</span>
                <select value={selectedCoach} onChange={(event) => { setSelectedCoach(event.target.value); setSelectedSlot(""); }} className="h-12 w-full rounded-lg border border-slate-200 px-3 text-sm">
                  <option value="">Select coach</option>
                  {coaches.map((entry) => <option key={entry.coach?._id} value={entry.coach?._id}>{entry.coach?.name}</option>)}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Available Time</span>
                <select value={selectedSlot} onChange={(event) => setSelectedSlot(event.target.value)} className="h-12 w-full rounded-lg border border-slate-200 px-3 text-sm" disabled={!selectedCoach}>
                  <option value="">Select time</option>
                  {slotOptions.map((slot) => <option key={slot.id} value={slot.id}>{slot.label} - {slot.coachLabel}</option>)}
                </select>
              </label>
            </div>
          )}
          <label className="mt-4 block space-y-2">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Message for academy</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-24 w-full rounded-lg border border-slate-200 px-3 py-3 text-sm outline-none focus:border-brand" placeholder="Mention preferred topic, goal, or anything the coach should know." />
          </label>
          <button onClick={book} disabled={loading} className="btn-primary mt-4 w-full sm:w-auto">
            <CalendarDays size={16} /> {loading ? `Sending ${featureName}...` : `Request ${featureName}`}
          </button>
        </div>

        <aside className="rounded-lg border border-purple-100 bg-purple-50/80 p-4 sm:p-5">
          <h3 className="font-black text-brand">How this works</h3>
          <div className="mt-4 space-y-3 text-sm text-slate-700">
            <Info icon={<UserRound size={16} />} title="Demo students" text="Your Demo Booking is sent to admin first. Admin can confirm the coach and time before the demo classroom opens." />
            <Info icon={<CheckCircle2 size={16} />} title="Credit students" text="Your selected coach reviews the Class Booking first. A classroom is created only after approval, and credit is deducted after attendance." />
            <Info icon={<Clock3 size={16} />} title="Monthly students" text="Monthly-plan classes remain fixed. Reschedule/cancel requests should still go through admin approval." />
          </div>
        </aside>
      </section>}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-black text-slate-950">Your Bookings</h2>
        <div className="mt-4 grid gap-3">
          {bookings.map((booking) => (
            <div key={booking._id} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="font-bold text-slate-950">{bookingFeatureNameForType(booking.bookingType)} with {booking.instructor?.name || "Coach"}</div>
                <div className="text-sm text-slate-500">{booking.requestedLocalDateTime || new Date(booking.startAt).toLocaleString()}</div>
                {booking.requestedIstDateTime ? <div className="text-xs font-semibold text-slate-500">IST: {booking.requestedIstDateTime}</div> : null}
                {booking.approvalStatus === "reschedule_proposed" && booking.proposedStartAt ? (
                  <div className="mt-1 text-sm font-semibold text-amber-700">Coach suggested {new Date(booking.proposedStartAt).toLocaleString()}</div>
                ) : null}
              </div>
              <span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-bold capitalize text-brand">{booking.approvalStatus || booking.status}</span>
            </div>
          ))}
          {bookings.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">No {isDemoStudent ? "demo" : "class"} bookings yet.</div>}
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
