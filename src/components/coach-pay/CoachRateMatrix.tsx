"use client";

import { useState } from "react";
import { Check, Clock3, Info, Send, Undo2 } from "lucide-react";

import { formatINR } from "@/lib/utils";

type ServerAction = (formData: FormData) => Promise<void>;

export type MatrixRow = {
  classroomId: string;
  classroomTitle: string;
  classroomType: string;
  batchName: string;
  isActive: boolean;
  ownValues: Record<string, { amount: number | null; unit: string }> | null;
  effective: Record<string, { amount: number; unit: string; sourceLabel: string } | null>;
  pendingProposal: {
    id: string;
    values: Record<string, { amount: number | null; unit: string }>;
    note: string;
    submittedAtLabel: string;
  } | null;
};

const KINDS = [
  { id: "regular", label: "Regular" },
  { id: "demo", label: "Demo" },
  { id: "demoConversionBonus", label: "Conversion bonus" },
  { id: "substitute", label: "Substitution" },
];

function rupees(amount: number | null | undefined) {
  return amount === null || amount === undefined ? "" : String(amount / 100);
}

/**
 * One coach's rates, class by class.
 *
 * This is the screen the academy actually works in: rates are agreed per coach
 * per class, so each row is one classroom they teach and each row saves on its
 * own. Where a row has no rate of its own, the inherited value is shown greyed
 * with the rung it came from, so it is always clear whether a number was chosen
 * for this coach or is just a default waiting to be replaced.
 *
 * In `propose` mode the same grid submits to the approval queue instead of
 * writing a rate, which is what lets a coach fill it in without paying
 * themselves.
 */
export function CoachRateMatrix({
  coachId,
  coachName,
  rows,
  mode,
  action,
  withdrawAction,
}: {
  coachId: string;
  coachName: string;
  rows: MatrixRow[];
  mode: "manage" | "propose";
  action: ServerAction;
  withdrawAction?: ServerAction;
}) {
  const [showInactive, setShowInactive] = useState(false);
  // One unit per row. A coach is paid by the class or by the hour - not one way
  // for demos and another for substitutions - so the grid asks once and mirrors
  // the answer onto each kind the server expects.
  const [units, setUnits] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      rows.map((row) => [row.classroomId, row.ownValues?.regular?.unit || row.effective.regular?.unit || "per_class"])
    )
  );

  const visible = rows.filter((row) => showInactive || row.isActive);
  const inactiveCount = rows.length - rows.filter((row) => row.isActive).length;

  if (!rows.length) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
        <p className="text-sm font-semibold text-slate-950">
          {mode === "manage" ? `${coachName} is not assigned to any classroom yet.` : "You are not assigned to any classroom yet."}
        </p>
        <p className="mt-1 text-xs text-slate-500">Rates appear here once a classroom names them as its coach.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
        <Info size={14} className="shrink-0 text-slate-400" />
        <span className="min-w-0">
          {mode === "manage"
            ? "Each row saves on its own. Leave a box blank to inherit from the batch or academy default; enter 0 to say the class is deliberately unpaid."
            : "Enter what you believe each class should pay. Nothing changes your earnings until an admin approves it."}
        </span>
        {inactiveCount > 0 && (
          <button type="button" onClick={() => setShowInactive((current) => !current)} className="btn-ghost ml-auto h-7 shrink-0 px-2 text-xs">
            {showInactive ? "Hide" : "Show"} {inactiveCount} closed classroom{inactiveCount === 1 ? "" : "s"}
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.08em] text-slate-500">
            <tr>
              <th className="border-b border-slate-200 px-3 py-2 font-bold">Class</th>
              {KINDS.map((kind) => (
                <th key={kind.id} className="border-b border-slate-200 px-2 py-2 text-right font-bold">
                  {kind.label}
                </th>
              ))}
              <th className="border-b border-slate-200 px-2 py-2 font-bold">Unit</th>
              {mode === "manage" && <th className="border-b border-slate-200 px-2 py-2 font-bold">From</th>}
              <th className="border-b border-slate-200 px-2 py-2 font-bold" />
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const formId = `rate-${row.classroomId}`;
              const rowUnit = units[row.classroomId] || "per_class";
              return (
                <tr key={row.classroomId} className="border-b border-slate-100 align-top last:border-0">
                  <td className="px-3 py-2">
                    <div className="font-semibold text-slate-950">
                      {row.classroomTitle}
                      {row.classroomType === "demo" && (
                        <span className="ml-2 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700 ring-1 ring-violet-200">demo</span>
                      )}
                      {!row.isActive && (
                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200">closed</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">{row.batchName}</div>
                    {row.pendingProposal && (
                      <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 ring-1 ring-amber-200">
                        <Clock3 size={11} /> Proposal awaiting approval
                      </div>
                    )}
                  </td>

                  {KINDS.map((kind) => {
                    const own = row.ownValues?.[kind.id];
                    const effective = row.effective[kind.id];
                    const proposed = row.pendingProposal?.values?.[kind.id];
                    const inherited = own?.amount === null || own?.amount === undefined;
                    return (
                      <td key={kind.id} className="px-2 py-2 text-right">
                        <input
                          form={formId}
                          name={`${kind.id}Amount`}
                          type="number"
                          min="0"
                          step="0.01"
                          defaultValue={mode === "propose" && proposed ? rupees(proposed.amount) : rupees(own?.amount)}
                          className="input h-9 w-28 text-right"
                          placeholder={effective ? String(effective.amount / 100) : "-"}
                          aria-label={`${kind.label} rate for ${row.classroomTitle}`}
                        />
                        <div className="mt-0.5 text-[11px] leading-4 text-slate-400">
                          {!inherited ? (
                            <span className="text-emerald-600">set for this coach</span>
                          ) : effective ? (
                            <span>
                              {formatINR(effective.amount)} &middot; {effective.sourceLabel}
                            </span>
                          ) : (
                            <span className="text-rose-500">not priced</span>
                          )}
                        </div>
                      </td>
                    );
                  })}

                  <td className="px-2 py-2">
                    <select
                      value={rowUnit}
                      onChange={(event) => setUnits((current) => ({ ...current, [row.classroomId]: event.target.value }))}
                      className="input h-9 w-28"
                      aria-label={`Rate unit for ${row.classroomTitle}`}
                    >
                      <option value="per_class">Per class</option>
                      <option value="per_hour">Per hour</option>
                    </select>
                  </td>

                  {mode === "manage" && (
                    <td className="px-2 py-2">
                      <input
                        form={formId}
                        name="effectiveFrom"
                        type="date"
                        className="input h-9 w-36"
                        aria-label={`Rate start date for ${row.classroomTitle}`}
                        title="Leave blank to apply to all history. Set a date to start a new rate from then, leaving earlier months untouched."
                      />
                    </td>
                  )}

                  <td className="px-2 py-2">
                    <form id={formId} action={action} className="flex flex-col items-end gap-1">
                      <input type="hidden" name="coach" value={coachId} />
                      <input type="hidden" name="classroom" value={row.classroomId} />
                      {KINDS.map((kind) => (
                        <input key={kind.id} type="hidden" name={`${kind.id}Unit`} value={rowUnit} />
                      ))}
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
                    {mode === "propose" && row.pendingProposal && withdrawAction && (
                      <form action={withdrawAction} className="mt-1 flex justify-end">
                        <input type="hidden" name="id" value={row.pendingProposal.id} />
                        <button type="submit" className="btn-ghost h-8 px-2 text-xs text-slate-500">
                          <Undo2 size={12} /> Withdraw
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
