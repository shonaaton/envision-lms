"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function BookingPage() {
  const [list, setList] = useState<any[]>([]);
  useEffect(() => { fetch("/api/bookings").then((r) => r.json()).then(setList); }, []);

  async function book(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const startAt = new Date(fd.get("startAt") as string).toISOString();
    const endAt = new Date(new Date(startAt).getTime() + 60 * 60 * 1000).toISOString();
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instructor: fd.get("instructor"), startAt, endAt }),
    });
    if (!res.ok) { const { error } = await res.json(); return toast.error(error); }
    toast.success("Booked");
    fetch("/api/bookings").then((r) => r.json()).then(setList);
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl text-accent">Self Booking</h1>
      <form onSubmit={book} className="card space-y-3">
        <input className="input" name="instructor" placeholder="Instructor user id" required />
        <input className="input" name="startAt" type="datetime-local" required />
        <button className="btn-accent">Book 1-hour session</button>
      </form>
      <div className="space-y-2">
        {list.map((b) => (
          <div key={b._id} className="card flex items-center justify-between">
            <div>
              <div className="text-white">{new Date(b.startAt).toLocaleString()}</div>
              <div className="text-xs text-gray-400">with {b.instructor?.name || "—"}</div>
            </div>
            <span className="chip">{b.status}</span>
          </div>
        ))}
        {list.length === 0 && <div className="card text-sm text-gray-400">No bookings yet.</div>}
      </div>
    </div>
  );
}
