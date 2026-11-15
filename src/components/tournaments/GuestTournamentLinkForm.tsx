"use client";

import { useState } from "react";
import { Mail } from "lucide-react";

/**
 * On the login page: a tournament guest gets their room link by email instead
 * of trying to sign in with an account they do not have. The address typed in
 * the login box is offered when it looks like one.
 */
export default function GuestTournamentLinkForm({ suggestedEmail = "" }: { suggestedEmail?: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  function start() {
    setEmail(/@/.test(suggestedEmail) ? suggestedEmail.trim() : "");
    setResult(null);
    setOpen(true);
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    setResult(null);
    try {
      const response = await fetch("/api/tournaments/guest-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json().catch(() => null);
      setResult(
        response.ok
          ? { ok: true, text: payload?.message || "If that email is registered, we have sent your tournament link." }
          : { ok: false, text: payload?.error || "Could not send the link. Please try again in a few minutes." }
      );
    } catch {
      setResult({ ok: false, text: "Could not send the link. Check your connection and try again." });
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={start} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:text-brand-700">
        <Mail size={15} aria-hidden /> Email me my tournament link
      </button>
    );
  }

  return (
    <form onSubmit={send} className="mt-2 grid gap-2">
      <label className="text-xs font-semibold text-slate-700" htmlFor="guest-link-email">
        The email you registered for the tournament with
      </label>
      <div className="flex gap-2">
        <input
          id="guest-link-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="input h-10 min-w-0 flex-1"
          placeholder="name@example.com"
        />
        <button className="btn-primary h-10 shrink-0 px-3" disabled={sending}>
          {sending ? "Sending..." : "Send link"}
        </button>
      </div>
      {result ? (
        <p role="status" className={`text-sm ${result.ok ? "text-emerald-700" : "text-rose-700"}`}>
          {result.text}
        </p>
      ) : null}
    </form>
  );
}
