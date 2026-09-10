"use client";

import { useState } from "react";
import { Layers, Plus } from "lucide-react";

type ServerAction = (formData: FormData) => Promise<void>;
type Option = { id: string; name: string };

const SCOPES = [
  { id: "academy", label: "Academy default", hint: "The fallback for everyone. Set this once so no class is ever unpriced." },
  { id: "coach", label: "One coach, everywhere", hint: "This coach's standard rates across every batch they teach." },
  { id: "batch", label: "One batch, any coach", hint: "What a class in this batch is worth, whoever takes it." },
  { id: "batch_coach", label: "One coach in one batch", hint: "This coach's rate for this batch specifically." },
  { id: "classroom", label: "One classroom, any coach", hint: "What a class in this classroom is worth, whoever takes it." },
  { id: "classroom_coach", label: "One coach in one classroom", hint: "The most specific rate there is, short of pricing a single class." },
];

const KINDS = [
  { id: "regular", label: "Regular class", hint: "A normal class taught by the coach it is assigned to." },
  { id: "demo", label: "Demo class", hint: "A trial class for a prospective student." },
  { id: "demoConversionBonus", label: "Demo conversion bonus", hint: "Paid when that demo turns into an enrolment, dated at the conversion." },
  { id: "substitute", label: "Substitution", hint: "Paid to a coach covering someone else's class." },
];

/**
 * One rung of the rate ladder, filled in.
 *
 * The scope picker drives which target the card needs, so an admin cannot
 * accidentally save "one coach in one batch" without saying which batch. Any
 * rate box left empty means this card is silent about that kind and the next
 * rung down decides - which is what makes a single academy default enough to
 * start with.
 */
export function RateCardForm({
  coaches,
  batches,
  classrooms,
  action,
  defaults,
}: {
  coaches: Option[];
  batches: Option[];
  classrooms: Option[];
  action: ServerAction;
  defaults?: {
    scope?: string;
    coach?: string;
    batch?: string;
    classroom?: string;
    effectiveFrom?: string;
    values?: Record<string, { amount: number | null; unit: string }>;
    note?: string;
  };
}) {
  const [scope, setScope] = useState(defaults?.scope || "academy");
  const needsCoach = scope === "coach" || scope === "batch_coach" || scope === "classroom_coach";
  const needsBatch = scope === "batch" || scope === "batch_coach";
  const needsClassroom = scope === "classroom" || scope === "classroom_coach";
  const activeScope = SCOPES.find((item) => item.id === scope);

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-slate-500">This rate applies to</span>
          <select name="scope" value={scope} onChange={(event) => setScope(event.target.value)} className="input h-10">
            {SCOPES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <span className="text-xs leading-5 text-slate-500">{activeScope?.hint}</span>
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-semibold text-slate-500">In force from</span>
          <input name="effectiveFrom" type="date" defaultValue={defaults?.effectiveFrom || ""} className="input h-10" />
          <span className="text-xs leading-5 text-slate-500">
            Leave blank to apply to all history. Give a raise a start date instead of editing the old card, and months already
            paid keep their old numbers.
          </span>
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {needsCoach && (
          <label className="grid gap-1">
            <span className="text-xs font-semibold text-slate-500">Coach</span>
            <select name="coach" defaultValue={defaults?.coach || ""} className="input h-10" required>
              <option value="">Choose a coach</option>
              {coaches.map((coach) => (
                <option key={coach.id} value={coach.id}>
                  {coach.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {needsBatch && (
          <label className="grid gap-1">
            <span className="text-xs font-semibold text-slate-500">Batch</span>
            <select name="batch" defaultValue={defaults?.batch || ""} className="input h-10" required>
              <option value="">Choose a batch</option>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {needsClassroom && (
          <label className="grid gap-1">
            <span className="text-xs font-semibold text-slate-500">Classroom</span>
            <select name="classroom" defaultValue={defaults?.classroom || ""} className="input h-10" required>
              <option value="">Choose a classroom</option>
              {classrooms.map((classroom) => (
                <option key={classroom.id} value={classroom.id}>
                  {classroom.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
          <Layers size={13} /> Rates on this card
        </span>
        {KINDS.map((kind) => (
          <div key={kind.id} className="grid items-start gap-2 border-b border-slate-200 py-2 last:border-0 sm:grid-cols-[minmax(0,1fr)_150px_140px]">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-950">{kind.label}</div>
              <div className="text-xs leading-5 text-slate-500">{kind.hint}</div>
            </div>
            <input
              name={`${kind.id}Amount`}
              type="number"
              min="0"
              step="0.01"
              defaultValue={
                defaults?.values?.[kind.id]?.amount !== null && defaults?.values?.[kind.id]?.amount !== undefined
                  ? String((defaults.values[kind.id].amount as number) / 100)
                  : ""
              }
              className="input h-10"
              placeholder="Leave blank"
              aria-label={`${kind.label} amount in rupees`}
            />
            <select
              name={`${kind.id}Unit`}
              defaultValue={defaults?.values?.[kind.id]?.unit || "per_class"}
              className="input h-10"
              aria-label={`${kind.label} unit`}
            >
              <option value="per_class">Per class</option>
              <option value="per_hour">Per hour</option>
            </select>
          </div>
        ))}
      </div>

      <label className="grid gap-1">
        <span className="text-xs font-semibold text-slate-500">Note</span>
        <input name="note" defaultValue={defaults?.note || ""} className="input h-10" placeholder="e.g. Agreed at the March review" />
      </label>

      <div>
        <button type="submit" className="btn-primary h-10 px-5">
          <Plus size={15} /> Save rate card
        </button>
      </div>
    </form>
  );
}
