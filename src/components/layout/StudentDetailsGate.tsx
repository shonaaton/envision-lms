"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { ADULT_AGE, STUDENT_AGE_MAX, STUDENT_AGE_MIN } from "@/lib/studentDetails";

type Defaults = { firstName: string; lastName: string; age: string; parentName: string; parentEmail: string; country: string; city: string };

const COUNTRIES = ["India", "United States", "United Kingdom", "United Arab Emirates", "Canada", "Australia", "Singapore", "Saudi Arabia", "Qatar", "Oman", "Kuwait", "Bahrain", "Bangladesh", "Nepal", "Myanmar", "Germany", "New Zealand"];

/**
 * Shown instead of the whole portal while a student's record is missing the
 * details in lib/studentDetails. There is no way past it but saving or signing out.
 */
export default function StudentDetailsGate({ defaults, lockedParent }: { defaults: Defaults; lockedParent: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState(defaults);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const age = Number(form.age);
  const adult = form.age !== "" && Number.isInteger(age) && age >= ADULT_AGE;
  const set = (key: keyof Defaults) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((value) => ({ ...value, [key]: event.target.value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/profile/details", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json().catch(() => ({}));
      // 409: already complete (saved in another tab) - the portal is open either way.
      if (!response.ok && response.status !== 409) {
        setError(data.error || "Could not save your details. Please try again.");
        setSaving(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the academy. Check your internet and try again.");
      setSaving(false);
    }
  }

  const input = "input w-full bg-white text-slate-950";
  return (
    <div className="flex min-h-dvh items-start justify-center overflow-y-auto bg-[linear-gradient(180deg,#f8fafc_0%,#f3f0f7_52%,#f8fafc_100%)] px-4 py-8 text-slate-950 sm:items-center">
      <form onSubmit={submit} className="w-full max-w-xl rounded-2xl border border-brand/10 bg-white p-5 shadow-xl sm:p-7" aria-labelledby="details-title">
        <h1 id="details-title" className="text-xl font-black text-slate-950">Complete your details</h1>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Please fill in these details before you continue. They help your coach place you in the right group and let us reach the right person.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Student's first name">
            <input className={input} name="firstName" value={form.firstName} onChange={set("firstName")} required maxLength={80} autoComplete="given-name" />
          </Field>
          <Field label="Student's last name">
            <input className={input} name="lastName" value={form.lastName} onChange={set("lastName")} required maxLength={80} autoComplete="family-name" />
          </Field>
          <Field label="Student's age" hint="In years">
            <input className={input} name="age" type="number" inputMode="numeric" min={STUDENT_AGE_MIN} max={STUDENT_AGE_MAX} step={1} value={form.age} onChange={set("age")} required />
          </Field>
          <div className="hidden sm:block" />
          {lockedParent ? (
            <Field label="Parent / guardian" hint="Already on file. Ask the academy to change it.">
              <input className={`${input} bg-slate-50 text-slate-500`} value={form.parentName} disabled />
            </Field>
          ) : (
            <Field label={`Parent's or guardian's name${adult ? " (optional)" : ""}`}>
              <input className={input} name="parentName" value={form.parentName} onChange={set("parentName")} required={!adult} maxLength={80} autoComplete="off" />
            </Field>
          )}
          <Field label="Parent's email (optional)">
            <input className={input} name="parentEmail" type="email" value={form.parentEmail} onChange={set("parentEmail")} maxLength={120} autoComplete="email" disabled={lockedParent && Boolean(defaults.parentEmail)} />
          </Field>
          <Field label="Country">
            <input className={input} name="country" value={form.country} onChange={set("country")} required maxLength={80} list="details-countries" autoComplete="country-name" />
            <datalist id="details-countries">{COUNTRIES.map((country) => <option key={country} value={country} />)}</datalist>
          </Field>
          <Field label="City">
            <input className={input} name="city" value={form.city} onChange={set("city")} required maxLength={80} autoComplete="address-level2" />
          </Field>
        </div>

        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <button type="button" className="text-sm font-semibold text-slate-500 hover:text-slate-800" onClick={() => signOut({ callbackUrl: "/" })}>
            Sign out
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Saving..." : "Save and continue"}</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid content-start gap-1 text-sm">
      <span className="font-semibold text-slate-700">{label}</span>
      {children}
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </label>
  );
}
