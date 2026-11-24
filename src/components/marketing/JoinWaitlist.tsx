"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, X } from "lucide-react";

/**
 * "Full - join the waitlist" on a centre page slot. The family is added to the
 * branch portal's waitlist and messaged when a seat in this batch frees up.
 */
export default function JoinWaitlist({ slotId, slotText }: { slotId: string; slotText: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<null | { already: boolean; position?: number }>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    setBusy(true);
    try {
      const response = await fetch("/api/public/bowbazar/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, slotId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return setError(payload?.error || "Something went wrong. Please try again.");
      setDone({ already: Boolean(payload.already), position: payload.position });
    } catch {
      setError("Couldn't reach the academy. Check your internet connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const input = "h-11 w-full rounded-lg border border-brand/20 bg-white px-3 text-base text-brand-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

  return (
    <>
      <span className="flex shrink-0 items-center gap-1.5">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-500 ring-1 ring-slate-200">Full</span>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setDone(null);
          }}
          className="rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-black text-white shadow-sm transition hover:bg-brand-900"
        >
          Join waitlist
        </button>
      </span>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-brand-900/40 p-0 sm:items-center sm:p-4" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Join the waitlist for ${slotText}`}
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-brand">Waitlist</p>
                <h3 className="mt-1 text-lg font-black text-brand-900">{slotText}</h3>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-brand-900/50 hover:bg-brand/5" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            {done ? (
              <div className="mt-4 text-center">
                <CheckCircle2 size={36} className="mx-auto text-emerald-600" />
                <p className="mt-2 text-sm leading-6 text-brand-900/80">
                  {done.already
                    ? "You are already on the waitlist for this batch. We will message you when a seat frees up."
                    : `You're on the waitlist${done.position ? ` (number ${done.position})` : ""}. We will message you on WhatsApp and email as soon as a seat in this batch frees up.`}
                </p>
                <button type="button" onClick={() => setOpen(false)} className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-black text-white">
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-4 space-y-3" noValidate>
                <p className="text-sm leading-6 text-brand-900/70">This batch is full. Leave your details and we will tell you the moment a seat is free.</p>
                <label className="block space-y-1">
                  <span className="text-xs font-bold text-brand-900/70">Child&apos;s name *</span>
                  <input name="childName" className={input} required autoComplete="off" />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-bold text-brand-900/70">Parent&apos;s name *</span>
                  <input name="parentName" className={input} required autoComplete="name" />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-bold text-brand-900/70">WhatsApp number *</span>
                  <input name="phone" type="tel" inputMode="numeric" className={input} required autoComplete="tel-national" placeholder="10-digit mobile number" />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-bold text-brand-900/70">Email *</span>
                  <input name="email" type="email" className={input} required autoComplete="email" />
                </label>
                {/* Honeypot: people never see it, bots fill it in. */}
                <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
                {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
                <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-black text-white disabled:opacity-60">
                  {busy && <Loader2 size={15} className="animate-spin" />} Join the waitlist
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
