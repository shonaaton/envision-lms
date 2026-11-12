"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AlarmClock, MessageCircle, Phone, PhoneMissed, PhoneOutgoing, Trash2, X } from "lucide-react";
import { DEFAULT_MISSED_CALL_REMINDER, MISSED_CALL_REMINDER_CHOICES } from "@/lib/demoLeadCalls";
import type { LeadSourceSummary } from "@/lib/leadSource";

/**
 * The Demo Leads CRM: a sheet (one lead per row) from tablet width up, and one
 * card per lead on phones, where a 12-column sheet cannot fit and the
 * salespeople mostly work from (2026-11-12, user: "new ui for mobile").
 *
 * Everything shown is prepared on the server (labels, dates in IST), so this
 * component only lays it out and submits the page's server actions. Stage and
 * salesperson save as soon as a new value is picked. Both layouts share the
 * same controls below, so a rule changed in one changes in both.
 *
 * Calls (2026-11-12): after a call the salesperson presses Picked up or Missed,
 * optionally with remarks; the server stamps the time. They can also set
 * themselves a call-back reminder, which arrives as a task and an email.
 */

export type DemoLeadSheetRow = {
  id: string;
  name: string;
  /** "" on requests sent before the form asked for one (2026-11-12). */
  email: string;
  /** The ad or website the family came from. */
  source: LeadSourceSummary;
  received: string;
  phoneLabel: string;
  telHref: string;
  whatsappHref: string;
  /** "manual": added by hand in the CRM, so there was never a code to check. */
  verification: "verified" | "failed" | "unverified" | "manual";
  age: string;
  level: string;
  classPreference: string;
  callTime: string;
  demoSlot: string;
  stage: string;
  ownerId: string;
  ownerName: string;
  noteCount: number;
  callCount: number;
  lastCall: { outcome: string; label: string; at: string } | null;
  /** Open call-backs, soonest first. "sent" = due, no call logged since. */
  reminders: Array<{ id: string; dueLabel: string; note: string; status: "scheduled" | "sent"; forName: string; mine: boolean; canCancel: boolean }>;
  /** Newest first. */
  log: Array<{ kind: string; outcome: string; text: string; byName: string; at: string }>;
};

export type ReminderFormState = { error: string; saved: number };

type Action = (formData: FormData) => void | Promise<void>;
type ReminderAction = (state: ReminderFormState, formData: FormData) => Promise<ReminderFormState>;

type Props = {
  rows: DemoLeadSheetRow[];
  stages: Array<{ value: string; label: string }>;
  owners: Array<{ id: string; name: string }>;
  canManage: boolean;
  seesAll: boolean;
  /** Admins, and salespeople on their own leads (the page only lists those to them). */
  canDelete: boolean;
  moveStage: Action;
  addNote: Action;
  changeOwner: Action;
  deleteLead: Action;
  logCall: Action;
  setReminder: ReminderAction;
  cancelReminder: Action;
  /** The earliest value the reminder box accepts (now, IST). */
  reminderMin: string;
  reminderPresets: Array<{ label: string; value: string }>;
  /** The lead to open on arrival: the one a reminder email links to. */
  initialOpen?: string | null;
};

type Shared = Omit<Props, "rows" | "initialOpen">;

const STAGE_STYLES: Record<string, string> = {
  new: "bg-amber-100 text-amber-900",
  qualified: "bg-sky-100 text-sky-900",
  demo_taken: "bg-violet-100 text-violet-900",
  converted: "bg-emerald-100 text-emerald-900",
  lost: "bg-slate-200 text-slate-700",
};

const VERIFICATION: Record<DemoLeadSheetRow["verification"], { label: string; style: string }> = {
  verified: { label: "Verified", style: "bg-emerald-100 text-emerald-800" },
  failed: { label: "Code not sent", style: "bg-rose-100 text-rose-800" },
  unverified: { label: "Not verified", style: "bg-rose-100 text-rose-800" },
  manual: { label: "Added by hand", style: "bg-slate-200 text-slate-700" },
};

const OUTCOME_STYLES: Record<string, string> = {
  picked_up: "bg-emerald-100 text-emerald-800",
  missed: "bg-rose-100 text-rose-800",
};

const TH = "border-b border-r border-slate-200 bg-slate-100 px-2 py-2 text-left text-[10px] font-black uppercase tracking-[0.04em] text-slate-600 last:border-r-0";
const TD = "break-words border-b border-r border-slate-200 px-2 py-2 align-middle last:border-r-0";
const SECTION_LABEL = "mb-2 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500";

function VerificationBadge({ row }: { row: DemoLeadSheetRow }) {
  const verification = VERIFICATION[row.verification];
  return (
    <span className={`block w-fit rounded-full px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.04em] ${verification.style}`}>{verification.label}</span>
  );
}

function OutcomeBadge({ outcome, label }: { outcome: string; label: string }) {
  return <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.04em] ${OUTCOME_STYLES[outcome] || "bg-slate-100 text-slate-700"}`}>{label}</span>;
}

/** The last call and the next call-back, for the sheet cell and the card. */
function CallSummary({ row }: { row: DemoLeadSheetRow }) {
  const next = row.reminders[0];
  return (
    <span className="block space-y-0.5 text-[11px] leading-4">
      {row.lastCall ? (
        <span className="block">
          <OutcomeBadge outcome={row.lastCall.outcome} label={row.lastCall.label} />
          <span className="ml-1 text-slate-600">{row.lastCall.at}</span>
        </span>
      ) : (
        <span className="block text-slate-400">No call logged</span>
      )}
      {next ? (
        <span className={`flex items-start gap-1 font-semibold ${next.status === "sent" ? "text-rose-700" : "text-amber-800"}`}>
          <AlarmClock size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{next.status === "sent" ? `Call-back due (${next.dueLabel})` : next.dueLabel}</span>
        </span>
      ) : null}
    </span>
  );
}

function StageControl({ row, stages, canManage, moveStage, className = "" }: Pick<Shared, "stages" | "canManage" | "moveStage"> & { row: DemoLeadSheetRow; className?: string }) {
  if (!canManage) {
    return (
      <span className={`inline-block rounded-md px-2 py-1 text-xs font-black ${STAGE_STYLES[row.stage] || ""}`}>
        {stages.find((stage) => stage.value === row.stage)?.label || row.stage}
      </span>
    );
  }
  return (
    <form action={moveStage}>
      <input type="hidden" name="lead" value={row.id} />
      <select
        key={row.stage}
        name="stage"
        defaultValue={row.stage}
        aria-label={`Stage for ${row.name}`}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className={`w-full cursor-pointer rounded-md border border-transparent px-1 font-black outline-none focus:border-brand ${STAGE_STYLES[row.stage] || ""} ${className || "h-8 text-xs"}`}
      >
        {stages.map((stage) => (
          <option key={stage.value} value={stage.value}>{stage.label}</option>
        ))}
      </select>
    </form>
  );
}

function OwnerControl({ row, owners, changeOwner, className = "" }: Pick<Shared, "owners" | "changeOwner"> & { row: DemoLeadSheetRow; className?: string }) {
  if (!owners.length) return <>{row.ownerName || <span className="text-slate-400">Unassigned</span>}</>;
  return (
    <form action={changeOwner}>
      <input type="hidden" name="lead" value={row.id} />
      <select
        key={row.ownerId}
        name="owner"
        defaultValue={row.ownerId}
        aria-label={`Salesperson for ${row.name}`}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className={`w-full cursor-pointer rounded-md border border-slate-200 bg-white px-1 font-bold text-slate-900 outline-none focus:border-brand ${className || "h-8 text-xs"}`}
      >
        {row.ownerId && !owners.some((owner) => owner.id === row.ownerId) ? <option value={row.ownerId}>{row.ownerName}</option> : null}
        {!row.ownerId ? <option value="">Unassigned</option> : null}
        {owners.map((owner) => (
          <option key={owner.id} value={owner.id}>{owner.name}</option>
        ))}
      </select>
    </form>
  );
}

function DeleteControl({ row, deleteLead, className = "" }: Pick<Shared, "deleteLead"> & { row: DemoLeadSheetRow; className?: string }) {
  return (
    <form
      action={deleteLead}
      onSubmit={(event) => {
        if (!window.confirm(`Delete the lead for ${row.name} (${row.phoneLabel})? Its notes and history go with it, and this cannot be undone.`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="lead" value={row.id} />
      <button aria-label={`Delete the lead for ${row.name}`} title="Delete lead" className={`rounded-md text-rose-600 hover:bg-rose-50 hover:text-rose-800 ${className || "p-1"}`}>
        <Trash2 size={15} />
      </button>
    </form>
  );
}

function SourceDetails({ row }: { row: DemoLeadSheetRow }) {
  return (
    <>
      <span className={`block font-bold ${row.source.channel === "meta_ad" ? "text-blue-800" : row.source.channel === "unknown" ? "text-slate-400" : "text-slate-900"}`}>
        {row.source.headline}
      </span>
      {row.source.details
        .filter((item) => ["Campaign", "Ad set", "Ad"].includes(item.label))
        .map((item) => (
          <span key={item.label} className="block text-[11px] text-slate-600" title={`${item.label}: ${item.value}`}>
            <span className="font-semibold text-slate-500">{item.label}:</span> {item.value}
          </span>
        ))}
      {row.classPreference !== "Online classes" ? <span className="mt-1 block text-[11px] font-semibold text-amber-800">{row.classPreference}</span> : null}
    </>
  );
}

/** Both outcome buttons, disabled while one is saving so a double tap logs one call. */
function OutcomeButtons({ setOutcome }: { setOutcome: (value: string) => void }) {
  const { pending } = useFormStatus();
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex">
      <button
        type="submit"
        disabled={pending}
        onClick={() => setOutcome("picked_up")}
        className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        <PhoneOutgoing size={15} aria-hidden="true" /> Picked up
      </button>
      <button
        type="submit"
        disabled={pending}
        onClick={() => setOutcome("missed")}
        className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-4 text-sm font-black text-white hover:bg-rose-700 disabled:opacity-60"
      >
        <PhoneMissed size={15} aria-hidden="true" /> Missed
      </button>
    </div>
  );
}

function CallLogForm({ row, logCall }: Pick<Shared, "logCall"> & { row: DemoLeadSheetRow }) {
  const outcome = useRef<HTMLInputElement>(null);
  return (
    // Keyed on the call count: once the call is saved the form comes back empty.
    <form key={row.callCount} action={logCall} className="rounded-xl border border-slate-200 bg-white p-3">
      <p className={SECTION_LABEL}>Log a call</p>
      <input type="hidden" name="lead" value={row.id} />
      <input ref={outcome} type="hidden" name="outcome" defaultValue="" />
      <textarea
        name="remarks"
        maxLength={1000}
        rows={2}
        aria-label={`Remarks on the call with ${row.name}`}
        placeholder="Remarks: what was said, or why it didn't connect (optional)"
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-brand"
      />
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <OutcomeButtons
          setOutcome={(value) => {
            if (outcome.current) outcome.current.value = value;
          }}
        />
        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
          If missed, remind me
          <select
            name="remindAfterMissed"
            defaultValue={DEFAULT_MISSED_CALL_REMINDER}
            className="h-8 rounded-md border border-slate-200 bg-white px-1.5 text-xs font-bold text-slate-900 outline-none focus:border-brand"
          >
            {MISSED_CALL_REMINDER_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>{choice.label}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-1.5 text-[11px] text-slate-500">
        The date and time are recorded automatically. A missed call sets a call-back for you (moved to 11 AM if it would fall outside 9 AM to 8 PM), unless you already have one on this lead.
      </p>
    </form>
  );
}

function SaveReminderButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary h-10 text-xs disabled:opacity-60">
      {pending ? "Saving..." : "Set reminder"}
    </button>
  );
}

function ReminderPanel({ row, setReminder, cancelReminder, reminderMin, reminderPresets }: Pick<Shared, "setReminder" | "cancelReminder" | "reminderMin" | "reminderPresets"> & { row: DemoLeadSheetRow }) {
  const [state, action] = useFormState(setReminder, { error: "", saved: 0 });
  const [dueAt, setDueAt] = useState("");
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.saved) return;
    setDueAt("");
    form.current?.reset();
  }, [state.saved]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className={SECTION_LABEL}>Call-back reminders</p>
      {row.reminders.length ? (
        <ul className="mb-3 space-y-1.5">
          {row.reminders.map((reminder) => (
            <li key={reminder.id} className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm ${reminder.status === "sent" ? "bg-rose-50" : "bg-amber-50"}`}>
              <AlarmClock size={15} className={`mt-0.5 shrink-0 ${reminder.status === "sent" ? "text-rose-700" : "text-amber-700"}`} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="font-bold text-slate-900">{reminder.dueLabel}</span>
                {reminder.status === "sent" ? <span className="ml-1 text-xs font-black text-rose-700">Due now</span> : null}
                {!reminder.mine ? <span className="ml-1 text-xs text-slate-500">for {reminder.forName}</span> : null}
                {reminder.note ? <span className="block break-words text-xs text-slate-600">{reminder.note}</span> : null}
              </span>
              {reminder.canCancel ? (
                <form action={cancelReminder}>
                  <input type="hidden" name="reminder" value={reminder.id} />
                  <button aria-label={`Remove the reminder for ${reminder.dueLabel}`} title="Remove reminder" className="rounded p-1 text-slate-500 hover:bg-white hover:text-rose-700">
                    <X size={14} />
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <form ref={form} action={action} className="space-y-2">
        <input type="hidden" name="lead" value={row.id} />
        <div className="flex flex-wrap gap-1.5">
          {reminderPresets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => setDueAt(preset.value)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-black ${dueAt === preset.value ? "bg-brand text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[12rem] flex-1 sm:flex-none">
            <span className="mb-1 block text-[11px] font-semibold text-slate-500">Remind me at (IST)</span>
            <input
              type="datetime-local"
              name="dueAt"
              required
              min={reminderMin}
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-950 outline-none focus:border-brand"
            />
          </label>
          <label className="min-w-[12rem] flex-1">
            <span className="mb-1 block text-[11px] font-semibold text-slate-500">Note for yourself (optional)</span>
            <input
              name="note"
              maxLength={300}
              placeholder="e.g. Father asked to call after 6"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:border-brand"
            />
          </label>
          <SaveReminderButton />
        </div>
        {state.error ? <p className="text-xs font-semibold text-rose-700">{state.error}</p> : null}
        <p className="text-[11px] text-slate-500">At that time you get an email and a task in Tasks. Logging the call closes it.</p>
      </form>
    </div>
  );
}

function LogEntry({ entry }: { entry: DemoLeadSheetRow["log"][number] }) {
  if (entry.kind === "call") {
    const [, ...remarks] = entry.text.split("\n");
    return (
      <li className="text-sm leading-6">
        <OutcomeBadge outcome={entry.outcome} label={entry.outcome === "picked_up" ? "Picked up" : "Missed"} />
        <span className="ml-1.5 text-xs font-semibold text-slate-600">{entry.at}</span>
        {remarks.length ? <span className="block whitespace-pre-line text-slate-900">{remarks.join("\n")}</span> : <span className="block text-xs text-slate-400">No remarks</span>}
        <span className="block text-xs text-slate-500">{entry.byName || "System"}</span>
      </li>
    );
  }
  return (
    <li className="text-sm leading-6">
      <span className={entry.kind === "note" ? "whitespace-pre-line text-slate-900" : "font-semibold text-slate-500"}>{entry.text}</span>
      <span className="block text-xs text-slate-500">{entry.byName || "System"} · {entry.at}</span>
    </li>
  );
}

/** Calls, reminders, where the lead came from, its history and the note box: the sheet's expanded row and the card's open panel. */
function LeadDetails({ row, shared }: { row: DemoLeadSheetRow; shared: Shared }) {
  const { canManage, addNote } = shared;
  return (
    <div className="max-w-3xl space-y-3">
      {canManage ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <CallLogForm row={row} logCall={shared.logCall} />
          <ReminderPanel
            row={row}
            setReminder={shared.setReminder}
            cancelReminder={shared.cancelReminder}
            reminderMin={shared.reminderMin}
            reminderPresets={shared.reminderPresets}
          />
        </div>
      ) : null}

      {row.source.details.length ? (
        <dl className="grid gap-x-6 gap-y-1 rounded-lg border border-slate-200 bg-white p-3 text-xs sm:grid-cols-2">
          <div className="font-black text-slate-700 sm:col-span-2">Where this lead came from: {row.source.headline}</div>
          {row.source.details.map((item) => (
            <div key={item.label} className="flex gap-2">
              <dt className="shrink-0 font-semibold text-slate-500">{item.label}</dt>
              <dd className="break-all text-slate-900">{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div>
        <p className={SECTION_LABEL}>History, newest first</p>
        {row.log.length ? (
          <ul className="space-y-2">
            {row.log.map((entry, at) => (
              <LogEntry key={at} entry={entry} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Nothing logged yet.</p>
        )}
      </div>

      {canManage ? (
        <form key={row.noteCount} action={addNote} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="lead" value={row.id} />
          <textarea
            name="note"
            required
            maxLength={1000}
            rows={2}
            aria-label={`Note about ${row.name}`}
            placeholder="A note without a call (WhatsApp chat, a message from the family)"
            className="min-w-[14rem] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-brand"
          />
          <button className="btn-outline text-xs">Add note</button>
        </form>
      ) : null}
    </div>
  );
}

const detailsLabel = (row: DemoLeadSheetRow, expanded: boolean) => {
  if (expanded) return "Hide";
  const count = row.callCount + row.noteCount;
  return count ? `Calls & notes (${count})` : "Log call";
};

/** Phones: one card per lead, the call buttons first, no sideways scrolling. */
function LeadCard({ row, expanded, toggle, openDetails, shared }: { row: DemoLeadSheetRow; expanded: boolean; toggle: () => void; openDetails: () => void; shared: Shared }) {
  const { stages, owners, canManage, seesAll, canDelete, moveStage, changeOwner, deleteLead } = shared;
  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-black leading-snug text-slate-950">{row.name}</p>
          {row.email ? (
            <a href={`mailto:${row.email}`} className="block break-all text-xs font-semibold text-brand hover:underline">
              {row.email}
            </a>
          ) : null}
          <p className="mt-0.5 text-[11px] text-slate-500">{row.received}</p>
        </div>
        {canDelete ? <DeleteControl row={row} deleteLead={deleteLead} className="-mr-1 -mt-1 p-2" /> : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-slate-900">{row.phoneLabel}</span>
        <VerificationBadge row={row} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {/* Opening the panel as the call starts means Picked up / Missed is waiting when they come back. */}
        <a href={row.telHref} onClick={canManage ? openDetails : undefined} className="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-brand/30 bg-brand/5 text-sm font-black text-brand">
          <Phone size={16} aria-hidden="true" /> Call
        </a>
        {row.whatsappHref ? (
          <a
            href={row.whatsappHref}
            target="_blank"
            rel="noreferrer"
            className="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-sm font-black text-emerald-800"
          >
            <MessageCircle size={16} aria-hidden="true" /> WhatsApp
          </a>
        ) : null}
      </div>
      <div className="mt-2">
        <CallSummary row={row} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div>
          <dt className="text-[10px] font-black uppercase tracking-[0.06em] text-slate-500">Child</dt>
          <dd className="text-slate-900">{row.age} · {row.level}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-black uppercase tracking-[0.06em] text-slate-500">Time to call</dt>
          <dd className="text-slate-900">{row.callTime || <span className="text-slate-400">Not given</span>}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-black uppercase tracking-[0.06em] text-slate-500">Demo slot</dt>
          <dd className="text-slate-900">{row.demoSlot || <span className="text-slate-400">Not chosen</span>}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[10px] font-black uppercase tracking-[0.06em] text-slate-500">Source</dt>
          <dd className="break-words">
            <SourceDetails row={row} />
          </dd>
        </div>
      </dl>

      <div className={`mt-3 grid gap-2 ${seesAll ? "grid-cols-2" : "grid-cols-1"}`}>
        <div className="min-w-0">
          <p className="mb-1 text-[10px] font-black uppercase tracking-[0.06em] text-slate-500">Stage</p>
          <StageControl row={row} stages={stages} canManage={canManage} moveStage={moveStage} className="h-10 text-sm" />
        </div>
        {seesAll ? (
          <div className="min-w-0 text-sm">
            <p className="mb-1 text-[10px] font-black uppercase tracking-[0.06em] text-slate-500">Salesperson</p>
            <OwnerControl row={row} owners={owners} changeOwner={changeOwner} className="h-10 text-sm" />
          </div>
        ) : null}
      </div>

      <button
        type="button"
        aria-expanded={expanded}
        onClick={toggle}
        className="mt-3 h-9 w-full rounded-lg bg-slate-100 text-xs font-black text-brand"
      >
        {detailsLabel(row, expanded)}
      </button>
      {expanded ? (
        <div className="mt-3 border-t border-slate-200 pt-3">
          <LeadDetails row={row} shared={shared} />
        </div>
      ) : null}
    </li>
  );
}

export function DemoLeadsSheet({ rows, initialOpen = null, ...shared }: Props) {
  const { stages, owners, canManage, seesAll, canDelete, moveStage, changeOwner, deleteLead } = shared;
  const [open, setOpen] = useState<string | null>(initialOpen);
  const columns = 10 + (seesAll ? 1 : 0) + (canDelete ? 1 : 0);
  const toggle = (id: string) => setOpen((current) => (current === id ? null : id));

  return (
    <>
      <ul className="space-y-3 md:hidden">
        {rows.map((row) => (
          <LeadCard key={row.id} row={row} expanded={open === row.id} toggle={() => toggle(row.id)} openDetails={() => setOpen(row.id)} shared={shared} />
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
        {/* Fixed column shares and wrapping cells: every column, the delete button included, is on screen without scrolling sideways. */}
        <table className="w-full min-w-[860px] table-fixed border-collapse text-xs text-slate-800">
          <colgroup>
            <col style={{ width: "7%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "5%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "9%" }} />
            {seesAll ? <col style={{ width: "9%" }} /> : null}
            <col style={{ width: "12%" }} />
            {canDelete ? <col style={{ width: "3%" }} /> : null}
          </colgroup>
          <thead>
            <tr>
              <th className={TH}>Received</th>
              <th className={TH}>Parent</th>
              <th className={TH}>WhatsApp</th>
              <th className={TH}>Age</th>
              <th className={TH}>Level</th>
              <th className={TH}>Source</th>
              <th className={TH}>Time to call</th>
              <th className={TH}>Demo slot</th>
              <th className={TH}>Stage</th>
              {seesAll ? <th className={TH}>Salesperson</th> : null}
              <th className={TH}>Calls</th>
              {canDelete ? <th className={TH}><span className="sr-only">Delete</span></th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const expanded = open === row.id;
              return (
                <Fragment key={row.id}>
                  <tr className={index % 2 ? "bg-slate-50/60" : "bg-white"}>
                    <td className={`${TD} text-[11px] text-slate-600`}>{row.received}</td>
                    <td className={TD}>
                      <span className="block font-bold text-slate-950">{row.name}</span>
                      {row.email ? (
                        <a href={`mailto:${row.email}`} className="block break-all text-[11px] font-semibold text-brand hover:underline">
                          {row.email}
                        </a>
                      ) : null}
                    </td>
                    <td className={TD}>
                      <a href={row.telHref} onClick={canManage ? () => setOpen(row.id) : undefined} className="whitespace-nowrap font-bold text-brand hover:underline">
                        {row.phoneLabel}
                      </a>
                      {row.whatsappHref ? (
                        <a
                          href={row.whatsappHref}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`WhatsApp ${row.name}`}
                          title="Open WhatsApp chat"
                          className="ml-1 inline-flex align-middle text-emerald-700 hover:text-emerald-900"
                        >
                          <MessageCircle size={15} />
                        </a>
                      ) : null}
                      <span className="mt-1 block">
                        <VerificationBadge row={row} />
                      </span>
                    </td>
                    <td className={TD}>{row.age}</td>
                    <td className={TD}>{row.level}</td>
                    <td className={TD}>
                      <SourceDetails row={row} />
                    </td>
                    <td className={TD}>{row.callTime || <span className="text-slate-400">Not given</span>}</td>
                    <td className={TD}>{row.demoSlot || <span className="text-slate-400">Not chosen</span>}</td>
                    <td className={TD}>
                      <StageControl row={row} stages={stages} canManage={canManage} moveStage={moveStage} />
                    </td>
                    {seesAll ? (
                      <td className={TD}>
                        <OwnerControl row={row} owners={owners} changeOwner={changeOwner} />
                      </td>
                    ) : null}
                    <td className={TD}>
                      <CallSummary row={row} />
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => toggle(row.id)}
                        className="mt-1 text-xs font-black text-brand hover:underline"
                      >
                        {detailsLabel(row, expanded)}
                      </button>
                    </td>
                    {canDelete ? (
                      <td className={`${TD} !px-0 text-center`}>
                        <DeleteControl row={row} deleteLead={deleteLead} />
                      </td>
                    ) : null}
                  </tr>

                  {expanded ? (
                    <tr className="bg-slate-50">
                      <td colSpan={columns} className="whitespace-normal border-b border-slate-200 px-4 py-3">
                        <LeadDetails row={row} shared={shared} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
