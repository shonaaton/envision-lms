"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Check, ChevronDown, Loader2 } from "lucide-react";
import { DEMO_THANKS_STORAGE_KEY } from "@/lib/demoRequest";
import { demoSlotDays, demoSlotLabel, demoSlotTimes } from "@/lib/demoRequestSlots";

type Handoff = { id: string; firstName: string; verified: boolean; slot?: { date: string; time: string } };

function readHandoff(): Handoff | null {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(DEMO_THANKS_STORAGE_KEY) || "null");
    if (!stored || typeof stored !== "object") return null;
    return { id: String(stored.id || ""), firstName: String(stored.firstName || ""), verified: Boolean(stored.verified), slot: stored.slot };
  } catch {
    return null;
  }
}

/**
 * The thank-you, with the demo slot picker under it.
 *
 * Everything it knows about the family comes from what the form left in
 * sessionStorage, so the first render is the same for everyone and the rest
 * fills in on the client. Without a request id (a bookmark, a shared link) it
 * points back to the form instead of offering slots it could not save.
 */
export default function DemoSlotPicker() {
  const [ready, setReady] = useState(false);
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [days, setDays] = useState<Array<{ key: string; label: string }>>([]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [saved, setSaved] = useState<{ date: string; time: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = readHandoff();
    setHandoff(stored);
    setDays(demoSlotDays());
    if (stored?.slot?.date && stored.slot.time) {
      setDate(stored.slot.date);
      setTime(stored.slot.time);
      setSaved(stored.slot);
    }
    setReady(true);
  }, []);

  const times = date ? demoSlotTimes(date) : [];
  const isSaved = Boolean(saved && saved.date === date && saved.time === time);

  async function confirm() {
    if (busy || !handoff?.id || !date || !time) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/demo-request/slot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: handoff.id, date, time }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error || "Could not save your slot. Please try again.");
        return;
      }
      const slot = { date, time };
      setSaved(slot);
      try {
        window.sessionStorage.setItem(DEMO_THANKS_STORAGE_KEY, JSON.stringify({ ...handoff, slot }));
      } catch {
        // The slot is saved on the server; only a refresh would forget it here.
      }
    } catch {
      setError("Could not reach us. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const canPick = Boolean(handoff?.id);

  return (
    <section className="dform-card dthx-card">
      <span className="dthx-success" aria-hidden="true">
        <Check size={34} strokeWidth={3} />
      </span>
      <p className="dthx-eyebrow">Registration successful</p>
      <h1>{handoff?.firstName ? `Thank you, ${handoff.firstName}!` : "Thank you for registering!"}</h1>
      <p className="dthx-intro">
        We&apos;re excited to be part of your child&apos;s chess journey.{" "}
        {canPick || !ready ? (
          <>
            <strong>Your free demo is the next move.</strong> Select a convenient date and an available time slot below.
          </>
        ) : (
          "Our team will contact you on WhatsApp to arrange your free demo."
        )}
      </p>

      {ready && !canPick ? (
        <div className="dthx-booking dthx-restart">
          <p>Have you not shared your details yet? It takes a minute, and then you can choose your demo slot.</p>
          <Link className="dform-btn" href="/book-free-demo-class/form">
            Book a free demo
          </Link>
        </div>
      ) : (
        <div className="dthx-booking">
          <div className="dthx-heading">
            <span aria-hidden="true">
              <CalendarDays size={18} />
            </span>
            <h2>Schedule your free demo</h2>
          </div>
          <p className="dthx-sub">Choose a date to see the demo times available on that day.</p>

          <div className="dthx-date">
            <label htmlFor="demo-slot-date">Select demo date</label>
            <div className="dform-input dform-select">
              <select
                id="demo-slot-date"
                value={date}
                disabled={!ready}
                onChange={(event) => {
                  setDate(event.target.value);
                  setTime("");
                  setError("");
                }}
              >
                <option value="">Choose a date</option>
                {days.map((day) => (
                  <option key={day.key} value={day.key}>
                    {day.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} aria-hidden="true" />
            </div>
          </div>

          {date ? (
            <div className="dthx-times">
              <p className="dthx-times-title" id="demo-slot-times">
                Available time slots
              </p>
              {times.length ? (
                <div className="dthx-slots" role="group" aria-labelledby="demo-slot-times">
                  {times.map((slot) => (
                    <button
                      key={slot.time}
                      type="button"
                      className="dthx-slot"
                      aria-pressed={time === slot.time}
                      onClick={() => {
                        setTime(slot.time);
                        setError("");
                      }}
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="dthx-none">No demo slots are available on this date. Please select another date.</p>
              )}
              <p className="dthx-zone">All times are in Indian Standard Time (IST).</p>

              {error ? (
                <p className="dform-error" role="alert">
                  {error}
                </p>
              ) : null}

              <button className="dform-btn dthx-confirm" type="button" disabled={busy || !time || isSaved} onClick={confirm}>
                {busy ? <Loader2 className="dform-spin" size={18} aria-hidden="true" /> : null}
                {isSaved ? "Slot selected" : "Confirm selected slot"}
              </button>

              <p className="dthx-status" role="status" aria-live="polite">
                {isSaved && saved ? (
                  <span>
                    Your preferred demo slot is {demoSlotLabel(saved.date, saved.time)}. Our team will contact you on WhatsApp with the demo details and
                    confirmation.
                  </span>
                ) : null}
              </p>
            </div>
          ) : null}

          {isSaved ? null : <p className="dthx-note">Our team will contact you on WhatsApp with your demo details.</p>}
        </div>
      )}
    </section>
  );
}
