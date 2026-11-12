"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { UserPlus, X } from "lucide-react";

/**
 * "Add lead" on the Demo Leads CRM (2026-11-13, user: "there is no way to
 * manually add leads"): a parent who phoned, walked in or was referred goes
 * into the same list as the form's leads. Every choice list comes from the
 * server, and the server re-checks everything (number length, one lead per
 * number, who may own it). On success the page opens the new lead.
 */

export type AddLeadFormState = { error: string; existingHref: string };

type Option = { value: string; label: string };

type Props = {
  addLead: (state: AddLeadFormState, formData: FormData) => Promise<AddLeadFormState>;
  dialCodes: Option[];
  ageGroups: Option[];
  childLevels: Option[];
  interests: Option[];
  sources: Option[];
  /** Admins only: the rotation salespeople. Empty for a salesperson, who owns what they add. */
  owners: Option[];
};

const LABEL = "mb-1 block text-[11px] font-black uppercase tracking-[0.08em] text-slate-500";
const FIELD = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:border-brand";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary h-10 disabled:opacity-60">
      {pending ? "Adding..." : "Add lead"}
    </button>
  );
}

export function AddDemoLeadForm({ addLead, dialCodes, ageGroups, childLevels, interests, sources, owners }: Props) {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(addLead, { error: "", existingHref: "" });

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary inline-flex h-10 items-center gap-1.5">
        <UserPlus size={16} aria-hidden="true" /> Add lead
      </button>
    );
  }

  return (
    <section aria-label="Add a lead" className="rounded-2xl border border-brand/20 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-brand">Add a lead by hand</h2>
          <p className="text-xs text-slate-600">For a family who phoned, walked in or was referred, and didn&apos;t fill the website form.</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close the add lead form" className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
          <X size={18} />
        </button>
      </div>

      <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="sm:col-span-2 lg:col-span-1">
          <span className={LABEL}>Parent&apos;s name *</span>
          <input name="name" required minLength={2} maxLength={120} autoComplete="off" className={FIELD} />
        </label>
        <div>
          <span className={LABEL}>WhatsApp number *</span>
          <div className="flex gap-2">
            <select name="countryCode" defaultValue="91" aria-label="Country code" className={`${FIELD} !w-24 shrink-0 px-2`}>
              {dialCodes.map((code) => (
                <option key={code.value} value={code.value}>{code.label}</option>
              ))}
            </select>
            <input name="phone" required inputMode="tel" maxLength={20} autoComplete="off" aria-label="WhatsApp number" placeholder="98765 43210" className={FIELD} />
          </div>
        </div>
        <label>
          <span className={LABEL}>Email</span>
          <input name="email" type="email" maxLength={160} autoComplete="off" className={FIELD} />
        </label>

        <label>
          <span className={LABEL}>How they reached us *</span>
          <select name="manualSource" required defaultValue="" className={FIELD}>
            <option value="" disabled>Choose one</option>
            {sources.map((source) => (
              <option key={source.value} value={source.value}>{source.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span className={LABEL}>Child&apos;s age</span>
          <select name="ageGroup" defaultValue="" className={FIELD}>
            <option value="">Not known</option>
            {ageGroups.map((age) => (
              <option key={age.value} value={age.value}>{age.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span className={LABEL}>Child&apos;s level</span>
          <select name="childLevel" defaultValue="" className={FIELD}>
            <option value="">Not known</option>
            {childLevels.map((level) => (
              <option key={level.value} value={level.value}>{level.label}</option>
            ))}
          </select>
        </label>

        <label>
          <span className={LABEL}>Class</span>
          <select name="interest" defaultValue={interests[0]?.value} className={FIELD}>
            {interests.map((interest) => (
              <option key={interest.value} value={interest.value}>{interest.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span className={LABEL}>Time to call</span>
          <input name="preferredTime" maxLength={120} placeholder="e.g. Weekdays after 6 PM" className={FIELD} />
        </label>
        {owners.length ? (
          <label>
            <span className={LABEL}>Salesperson</span>
            <select name="owner" defaultValue="" className={FIELD}>
              <option value="">Next in rotation</option>
              {owners.map((owner) => (
                <option key={owner.value} value={owner.value}>{owner.label}</option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="sm:col-span-2 lg:col-span-3">
          <span className={LABEL}>Note</span>
          <textarea name="note" rows={2} maxLength={1000} placeholder="What the family said, who referred them" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-brand" />
        </label>

        <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-3">
          <SaveButton />
          <button type="button" onClick={() => setOpen(false)} className="btn-outline h-10">Cancel</button>
          {state.error ? (
            <p role="alert" className="text-sm font-semibold text-rose-700">
              {state.error}{" "}
              {state.existingHref ? (
                <a href={state.existingHref} className="underline">Open that lead</a>
              ) : null}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
