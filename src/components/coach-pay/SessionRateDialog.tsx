"use client";

import { useState } from "react";
import { IndianRupee, X } from "lucide-react";

type ServerAction = (formData: FormData) => Promise<void>;

/**
 * Price one class by hand.
 *
 * Substitutions are the reason this exists: cover is usually arranged in a
 * phone call at a number agreed on the spot, which no standing price list
 * knows about. Typing it here beats it into the same pay line as everything
 * else instead of living in a WhatsApp thread.
 */
export function SessionRateDialog({
  classroomId,
  sessionId,
  coachId,
  coachName,
  classroomTitle,
  sessionLabel,
  sessionDate,
  kind,
  currentAmount,
  currentUnit,
  currentSource,
  hasOverride,
  minutes,
  saveAction,
  clearAction,
  overrideId,
}: {
  classroomId: string;
  sessionId: string;
  coachId: string;
  coachName: string;
  classroomTitle: string;
  sessionLabel: string;
  sessionDate: string;
  kind: string;
  currentAmount: number;
  currentUnit: string;
  currentSource: string;
  hasOverride: boolean;
  minutes: number;
  saveAction: ServerAction;
  clearAction: ServerAction;
  overrideId: string;
}) {
  const [open, setOpen] = useState(false);
  const [unit, setUnit] = useState(currentUnit === "per_hour" ? "per_hour" : "per_class");

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost h-8 px-2 text-xs" title="Set the rate for this one class">
        <IndianRupee size={13} /> {hasOverride ? "Edit rate" : "Set rate"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-md overflow-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-950">Rate for this class only</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {coachName} &middot; {classroomTitle} &middot; {sessionLabel} &middot; {sessionDate}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost h-8 w-8 p-0" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <form action={saveAction} className="grid gap-4 p-4">
              <input type="hidden" name="classroom" value={classroomId} />
              <input type="hidden" name="sessionId" value={sessionId} />
              <input type="hidden" name="coach" value={coachId} />
              <input type="hidden" name="kind" value={kind} />

              <p className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                Currently priced from <span className="font-bold text-slate-900">{currentSource}</span>. Anything entered here
                overrides that for this class alone and leaves every other class on the same rate.
              </p>

              <div className="grid grid-cols-[minmax(0,1fr)_140px] gap-2">
                <label className="grid gap-1">
                  <span className="text-xs font-semibold text-slate-500">Amount (&#8377;)</span>
                  <input
                    name="amount"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    defaultValue={currentAmount ? String(currentAmount / 100) : ""}
                    className="input h-10"
                    placeholder="0.00"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-semibold text-slate-500">Charged</span>
                  <select name="unit" value={unit} onChange={(event) => setUnit(event.target.value)} className="input h-10">
                    <option value="per_class">Per class</option>
                    <option value="per_hour">Per hour</option>
                  </select>
                </label>
              </div>
              {unit === "per_hour" && (
                <p className="-mt-2 text-xs text-slate-500">This class runs {minutes} minutes, so an hourly rate is pro-rated to {(minutes / 60).toFixed(2)} hours.</p>
              )}

              <label className="grid gap-1">
                <span className="text-xs font-semibold text-slate-500">Why (kept on the record)</span>
                <input name="reason" className="input h-10" placeholder="e.g. Agreed cover rate with the substitute" />
              </label>

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="btn-ghost h-10 px-4">
                  Cancel
                </button>
                <button type="submit" className="btn-primary h-10 px-5">
                  Save rate
                </button>
              </div>
            </form>

            {hasOverride && (
              <form action={clearAction} className="border-t border-slate-200 p-4">
                <input type="hidden" name="id" value={overrideId} />
                <button type="submit" className="btn-ghost h-9 px-3 text-xs text-rose-600 hover:bg-rose-50">
                  Remove this override and go back to the standing rate
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
