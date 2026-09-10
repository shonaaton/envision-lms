"use client";

import { Check, Send, Undo2 } from "lucide-react";

import { formatINR } from "@/lib/utils";

type ServerAction = (formData: FormData) => Promise<void>;

/**
 * The rate box that sits on one substitution class.
 *
 * Inline rather than behind a dialog because substitutions are worked through a
 * month at a time - an admin going down the list should be able to type four
 * numbers and save four rows without opening anything.
 *
 * The same control does duty for a coach, where it submits a proposal instead
 * of a rate and says so on the button.
 */
export function SubstitutionRateForm({
  classroomId,
  sessionId,
  sessionDateIso,
  coachId,
  minutes,
  currentAmount,
  currentUnit,
  sourceLabel,
  hasOverride,
  mode,
  action,
  pendingProposal,
  withdrawAction,
}: {
  classroomId: string;
  sessionId: string;
  sessionDateIso: string;
  coachId: string;
  minutes: number;
  currentAmount: number;
  currentUnit: string;
  sourceLabel: string;
  hasOverride: boolean;
  mode: "manage" | "propose";
  action: ServerAction;
  pendingProposal: { id: string; amount: number; unit: string; note: string } | null;
  withdrawAction?: ServerAction;
}) {
  const defaultAmount = pendingProposal
    ? String(pendingProposal.amount / 100)
    : currentAmount
      ? String(currentAmount / 100)
      : "";

  return (
    <div className="grid gap-1">
      <form action={action} className="flex flex-wrap items-center justify-end gap-1.5">
        <input type="hidden" name="classroom" value={classroomId} />
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="sessionDate" value={sessionDateIso} />
        {mode === "manage" && <input type="hidden" name="coach" value={coachId} />}
        {mode === "manage" && <input type="hidden" name="kind" value="substitute" />}

        <input
          name="amount"
          type="number"
          min="0"
          step="0.01"
          required
          defaultValue={defaultAmount}
          className="input h-9 w-28 text-right"
          placeholder="0.00"
          aria-label="Substitution rate in rupees"
        />
        <select name="unit" defaultValue={pendingProposal?.unit || currentUnit || "per_class"} className="input h-9 w-28" aria-label="Rate unit">
          <option value="per_class">Per class</option>
          <option value="per_hour">Per hour</option>
        </select>
        <button type="submit" className={mode === "manage" ? "btn-primary h-9 px-3 text-xs" : "btn-accent h-9 px-3 text-xs"}>
          {mode === "manage" ? (
            <>
              <Check size={13} /> Save
            </>
          ) : (
            <>
              <Send size={13} /> Propose
            </>
          )}
        </button>
      </form>

      <div className="text-right text-[11px] leading-4 text-slate-400">
        {hasOverride ? (
          <span className="text-emerald-600">set for this class</span>
        ) : currentAmount ? (
          <span>
            now {formatINR(currentAmount)} &middot; {sourceLabel}
          </span>
        ) : (
          <span className="text-rose-500">not priced</span>
        )}
        {currentUnit === "per_hour" && <span> &middot; {minutes}m class</span>}
      </div>

      {pendingProposal && (
        <div className="flex items-center justify-end gap-2 text-[11px] text-amber-700">
          <span className="rounded-full bg-amber-50 px-2 py-0.5 font-bold ring-1 ring-amber-200">
            Proposed {formatINR(pendingProposal.amount)} - awaiting approval
          </span>
          {mode === "propose" && withdrawAction && (
            <form action={withdrawAction}>
              <input type="hidden" name="id" value={pendingProposal.id} />
              <button type="submit" className="btn-ghost h-7 px-2 text-[11px] text-slate-500">
                <Undo2 size={11} /> Withdraw
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
