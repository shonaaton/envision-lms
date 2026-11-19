"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Gavel, X } from "lucide-react";

type ActionResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * The decision popup for a class the coach missed.
 *
 * Two independent answers, like the student no-show popup: fine the coach or
 * not (and how much), and make the next class free or not. The family is
 * never charged for the missed class itself either way. What each switch does
 * to real money is spelled out under it.
 */
export function CoachNoShowRulingDialog({
  classroomId,
  classroomTitle,
  sessionId,
  sessionDateLabel,
  sessionLabel,
  coachName,
  students,
  classValue,
  existing,
  action,
}: {
  classroomId: string;
  classroomTitle: string;
  sessionId: string;
  sessionDateLabel: string;
  sessionLabel: string;
  coachName: string;
  students: Array<{ id: string; name: string }>;
  /** The class's normal pay in paise, offered as the fine. 0 when unpriced. */
  classValue: number;
  existing: { chargeFine: boolean; fineAmount: number; freeNextClass: boolean; note: string; familiesNotified: boolean } | null;
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [chargeFine, setChargeFine] = useState(existing ? existing.chargeFine : false);
  const [fine, setFine] = useState(
    existing?.fineAmount ? String(existing.fineAmount / 100) : classValue ? String(classValue / 100) : ""
  );
  const [freeNextClass, setFreeNextClass] = useState(existing ? existing.freeNextClass : true);
  const [notify, setNotify] = useState(!existing);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError("");
    startTransition(async () => {
      const result = await action(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
      window.alert(result.message);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={existing ? "btn-ghost h-8 px-3 text-xs" : "btn-primary h-8 px-3 text-xs"}
      >
        <Gavel size={13} /> {existing ? "Change ruling" : "Rule on this"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-lg overflow-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-950">Coach missed a class</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {classroomTitle} &middot; {sessionLabel} &middot; {sessionDateLabel}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost h-8 w-8 p-0" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <form action={submit} className="grid gap-4 p-4">
              <input type="hidden" name="classroom" value={classroomId} />
              <input type="hidden" name="sessionId" value={sessionId} />
              <input type="hidden" name="chargeFine" value={chargeFine ? "yes" : "no"} />
              <input type="hidden" name="freeNextClass" value={freeNextClass ? "yes" : "no"} />
              <input type="hidden" name="notify" value={notify ? "yes" : "no"} />

              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-900">
                <span className="inline-flex items-center gap-1.5 font-bold">
                  <AlertTriangle size={13} /> {coachName} did not take this class
                </span>
                <p className="mt-1">
                  The missed class is not paid to the coach and is not charged to the family, whatever you decide below.
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 p-3">
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="checkbox" checked={chargeFine} onChange={(event) => setChargeFine(event.target.checked)} className="mt-0.5 h-4 w-4" />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-950">Deduct a fine from the coach&apos;s pay</span>
                    <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                      {chargeFine
                        ? `Shown as a deduction on ${coachName}'s pay and invoice for the month of the missed class.`
                        : "No fine. Only the missed class goes unpaid."}
                    </span>
                  </span>
                </label>
                {chargeFine && (
                  <label className="mt-3 grid gap-1 pl-7">
                    <span className="text-xs font-semibold text-slate-500">Fine amount (Rs)</span>
                    <input
                      name="fineAmount"
                      type="number"
                      min="1"
                      step="1"
                      value={fine}
                      onChange={(event) => setFine(event.target.value)}
                      className="input h-10 w-40"
                      required
                    />
                    {classValue > 0 && <span className="text-[11px] text-slate-400">This class normally pays Rs {classValue / 100}.</span>}
                  </label>
                )}
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:border-brand/30">
                <input type="checkbox" checked={freeNextClass} onChange={(event) => setFreeNextClass(event.target.checked)} className="mt-0.5 h-4 w-4" />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-slate-950">Make the next class free</span>
                  <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                    {freeNextClass
                      ? `Free for the family and for the academy: each student on a credit plan gets one class credit now, and ${coachName} is not paid for their next class in this classroom.`
                      : "The next class is charged and paid as usual."}
                    {existing?.freeNextClass && !freeNextClass ? " The free-class credit already given is taken back." : ""}
                  </span>
                </span>
              </label>

              {students.length > 0 && (
                <div className="rounded-lg bg-slate-50 p-3">
                  <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Students on this class</span>
                  <p className="mt-1 text-xs leading-5 text-slate-700">{students.map((student) => student.name).join(", ")}</p>
                </div>
              )}

              <label className="grid gap-1">
                <span className="text-xs font-semibold text-slate-500">Reason (kept on the record, shown to the coach)</span>
                <textarea
                  name="note"
                  defaultValue={existing?.note || ""}
                  rows={3}
                  className="input"
                  placeholder="e.g. Coach did not join and did not inform the academy."
                />
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3">
                <input type="checkbox" checked={notify} onChange={(event) => setNotify(event.target.checked)} className="mt-0.5 h-4 w-4" />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-slate-950">Message the family and the coach</span>
                  <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                    In-app, email and WhatsApp. The family gets an apology{freeNextClass ? " and hears the next class is free" : ""}; the coach hears the decision.
                    {existing?.familiesNotified ? " The family was already messaged, so they hear again only if this change adds the free class." : ""}
                  </span>
                </span>
              </label>

              {error && <p className="rounded-lg bg-rose-50 p-2 text-xs font-semibold text-rose-700">{error}</p>}

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="btn-ghost h-10 px-4">
                  Cancel
                </button>
                <button type="submit" className="btn-primary h-10 px-5" disabled={pending}>
                  {pending ? "Saving..." : "Save ruling"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
