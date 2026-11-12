"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { ArrowLeft, CheckCircle2, LogIn, UserPlus } from "lucide-react";
import { registerGuestForTournament, returnGuestToTournament } from "./actions";
import { TournamentRules } from "@/components/tournaments/TournamentRules";
import type { GuestFormState } from "@/lib/tournament/externalRegistration";
import { GUEST_USERNAME_MAX, GUEST_USERNAME_MIN } from "@/lib/tournament/externalRegistration";
import type { RuleSection } from "@/lib/tournament/rules";
import { DIAL_CODES, dialCodeEntry } from "@/lib/phoneCountryCodes";

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

type Step = "choose" | "register" | "returning";

const EMPTY: GuestFormState = { error: "" };

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary h-11 w-full">
      {pending ? "Please wait..." : children}
    </button>
  );
}

function fieldClass(active: boolean) {
  return `input mt-1 h-11 ${active ? "border-red-300 ring-4 ring-red-100" : ""}`;
}

/** Cloudflare Turnstile, rendered explicitly because the form mounts after the script loads. */
function Turnstile({ siteKey, resetKey }: { siteKey: string; resetKey: unknown }) {
  const ref = useRef<HTMLDivElement>(null);
  const widget = useRef<string>("");

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const mount = () => {
      if (cancelled || !ref.current) return;
      if (!window.turnstile) {
        timer = setTimeout(mount, 200);
        return;
      }
      if (!widget.current) widget.current = window.turnstile.render(ref.current, { sitekey: siteKey, theme: "light" });
    };
    mount();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = "";
    };
  }, [siteKey]);

  // A token is single-use: after a rejected attempt, issue a fresh one.
  useEffect(() => {
    if (widget.current && resetKey) window.turnstile?.reset(widget.current);
  }, [resetKey]);

  return (
    <div className="space-y-1.5">
      <div ref={ref} />
      <p className="text-xs text-slate-500">This check keeps automated sign-ups out of the tournament.</p>
    </div>
  );
}

export function GuestRegistrationForm({
  token,
  accessMode,
  registrationKey,
  turnstileSiteKey,
  rules,
  registrationClosedMessage,
}: {
  token: string;
  accessMode: string;
  registrationKey: string;
  turnstileSiteKey: string;
  rules: RuleSection[];
  /** Set when new registrations are not possible; returning players can still get in. */
  registrationClosedMessage: string;
}) {
  const [step, setStep] = useState<Step>("choose");
  const [registerState, registerAction] = useFormState(registerGuestForTournament, EMPTY);
  const [returnState, returnAction] = useFormState(returnGuestToTournament, EMPTY);
  const [form, setForm] = useState({ displayName: "", username: "", email: "", countryCode: "+91", phone: "", password: "", acceptRules: false });
  const [back, setBack] = useState({ contact: "", username: "" });
  const needsPassword = accessMode === "password" || accessMode === "entry_code";
  const dial = dialCodeEntry(form.countryCode);

  const update = (key: keyof typeof form, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));

  if (step === "choose") {
    return (
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-slate-950">Have you already registered for this tournament?</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setStep("returning")}
            className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-brand/40 hover:bg-brand-50/40"
          >
            <LogIn size={20} className="mt-0.5 shrink-0 text-brand" aria-hidden />
            <span>
              <span className="block font-semibold text-slate-950">Yes, I have registered</span>
              <span className="mt-0.5 block text-sm text-slate-600">Enter your email or WhatsApp number and your username.</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setStep("register")}
            disabled={Boolean(registrationClosedMessage)}
            className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-brand/40 hover:bg-brand-50/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <UserPlus size={20} className="mt-0.5 shrink-0 text-brand" aria-hidden />
            <span>
              <span className="block font-semibold text-slate-950">No, register me</span>
              <span className="mt-0.5 block text-sm text-slate-600">
                {registrationClosedMessage || "Takes a minute. No account or password needed."}
              </span>
            </span>
          </button>
        </div>
      </div>
    );
  }

  const backButton = (
    <button type="button" onClick={() => setStep("choose")} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800">
      <ArrowLeft size={14} aria-hidden /> Back
    </button>
  );

  if (step === "returning") {
    return (
      <form action={returnAction} className="space-y-4">
        {backButton}
        <h2 className="text-base font-semibold text-slate-950">Welcome back</h2>
        <input type="hidden" name="token" value={token} />
        {returnState.error ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {returnState.error}
          </p>
        ) : null}
        <label className="block text-sm font-medium text-slate-800">
          Email or WhatsApp number
          <input
            name="contact"
            required
            autoComplete="email"
            value={back.contact}
            onChange={(event) => setBack((current) => ({ ...current, contact: event.target.value }))}
            className={fieldClass(returnState.field === "contact")}
            placeholder="The email or number you registered with"
          />
        </label>
        <label className="block text-sm font-medium text-slate-800">
          Username
          <input
            name="username"
            required
            autoComplete="username"
            value={back.username}
            onChange={(event) => setBack((current) => ({ ...current, username: event.target.value }))}
            className={fieldClass(returnState.field === "username")}
            placeholder="Your tournament username"
          />
        </label>
        <Submit>Enter tournament room</Submit>
        {!registrationClosedMessage ? (
          <p className="text-center text-sm text-slate-500">
            Not registered yet?{" "}
            <button type="button" onClick={() => setStep("register")} className="font-semibold text-brand hover:underline">
              Register now
            </button>
          </p>
        ) : null}
      </form>
    );
  }

  return (
    <form action={registerAction} className="space-y-4">
      {backButton}
      <h2 className="text-base font-semibold text-slate-950">Register for the tournament</h2>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="registrationKey" value={registrationKey} />
      {registerState.error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {registerState.error}
        </p>
      ) : null}

      <label className="block text-sm font-medium text-slate-800">
        Full name
        <input
          name="displayName"
          required
          maxLength={60}
          autoComplete="name"
          value={form.displayName}
          onChange={(event) => update("displayName", event.target.value)}
          className={fieldClass(registerState.field === "name")}
          placeholder="Shown in the standings"
        />
      </label>

      <label className="block text-sm font-medium text-slate-800">
        Username
        <input
          name="username"
          required
          minLength={GUEST_USERNAME_MIN}
          maxLength={GUEST_USERNAME_MAX}
          autoComplete="username"
          value={form.username}
          onChange={(event) => update("username", event.target.value)}
          className={fieldClass(registerState.field === "username")}
          placeholder="e.g. knight_rider"
        />
        <span className="mt-1 block text-xs font-normal text-slate-500">
          {GUEST_USERNAME_MIN}-{GUEST_USERNAME_MAX} letters or numbers. You use it with your email or WhatsApp number to get back in.
        </span>
      </label>

      <label className="block text-sm font-medium text-slate-800">
        Email
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          value={form.email}
          onChange={(event) => update("email", event.target.value)}
          className={fieldClass(registerState.field === "email")}
          placeholder="Your confirmation and reminders go here"
        />
      </label>

      <div className="block text-sm font-medium text-slate-800">
        <label htmlFor="guest-phone">
          WhatsApp number <span className="font-normal text-slate-500">(optional, for reminders)</span>
        </label>
        <div className="mt-1 flex gap-2">
          <select
            name="countryCode"
            aria-label="Country code"
            value={form.countryCode}
            onChange={(event) => update("countryCode", event.target.value)}
            className="input h-11 w-28 shrink-0"
          >
            {DIAL_CODES.map((entry) => (
              <option key={entry.code} value={`+${entry.code}`}>
                +{entry.code} {entry.country.split(" / ")[0]}
              </option>
            ))}
          </select>
          <input
            id="guest-phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            value={form.phone}
            onChange={(event) => update("phone", event.target.value)}
            className={`${fieldClass(registerState.field === "phone")} mt-0`}
            placeholder={dial ? `${dial.nationalLengths.join(" or ")}-digit number` : "Your number"}
          />
        </div>
      </div>

      {needsPassword ? (
        <label className="block text-sm font-medium text-slate-800">
          {accessMode === "entry_code" ? "Entry code" : "Invitation password"}
          <input
            name="password"
            required
            value={form.password}
            onChange={(event) => update("password", event.target.value)}
            className={fieldClass(registerState.field === "password")}
            placeholder={accessMode === "entry_code" ? "From the organiser" : "From your invitation"}
          />
        </label>
      ) : null}

      <div>
        <p className="text-sm font-semibold text-slate-900">Tournament rules</p>
        <div className="mt-1.5 max-h-72 overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-slate-50 p-4">
          <TournamentRules sections={rules} compact />
        </div>
        <label
          className={`mt-3 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm ${
            registerState.field === "rules" ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
          }`}
        >
          <input
            type="checkbox"
            name="acceptRules"
            value="yes"
            checked={form.acceptRules}
            onChange={(event) => update("acceptRules", event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
          />
          <span className="text-slate-700">I have read the rules and agree to play by them.</span>
        </label>
      </div>

      {turnstileSiteKey ? <Turnstile siteKey={turnstileSiteKey} resetKey={registerState} /> : null}

      <Submit>
        <CheckCircle2 size={16} aria-hidden /> Register
      </Submit>
      <p className="text-center text-sm text-slate-500">
        Already registered?{" "}
        <button type="button" onClick={() => setStep("returning")} className="font-semibold text-brand hover:underline">
          Enter the room
        </button>
      </p>
    </form>
  );
}
