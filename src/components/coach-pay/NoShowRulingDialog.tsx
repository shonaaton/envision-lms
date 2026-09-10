"use client";

import { useState } from "react";
import { AlertTriangle, Gavel, X } from "lucide-react";

type ServerAction = (formData: FormData) => Promise<void>;

/**
 * The decision popup for a class nobody taught.
 *
 * Two switches, deliberately independent. The usual ruling is "pay the coach,
 * do not charge the student" - the coach turned up and the family had a reason
 * - and that pairing is only reachable if neither switch drives the other. The
 * consequence of each choice is spelled out under it, because one of them moves
 * a real credit off a student's balance.
 */
export function NoShowRulingDialog({
  classroomId,
  classroomTitle,
  sessionId,
  sessionDate,
  sessionDateLabel,
  sessionStatus,
  sessionLabel,
  coachId,
  coachName,
  students,
  existing,
  action,
}: {
  classroomId: string;
  classroomTitle: string;
  sessionId: string;
  /** ISO instant, stored with the ruling. */
  sessionDate: string;
  /** The same day, written the way a person reads it. */
  sessionDateLabel: string;
  sessionStatus: string;
  sessionLabel: string;
  coachId: string;
  coachName: string;
  students: Array<{ id: string; name: string }>;
  existing: { payCoach: boolean; deductStudentCredit: boolean; note: string } | null;
  action: ServerAction;
}) {
  const [open, setOpen] = useState(false);
  const [payCoach, setPayCoach] = useState(existing ? existing.payCoach : true);
  const [deductCredit, setDeductCredit] = useState(existing ? existing.deductStudentCredit : false);

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
                <h2 className="text-base font-bold text-slate-950">Rule on a missed class</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {classroomTitle} &middot; {sessionLabel} &middot; {sessionDateLabel}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost h-8 w-8 p-0" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <form action={action} className="grid gap-4 p-4">
              <input type="hidden" name="classroom" value={classroomId} />
              <input type="hidden" name="sessionId" value={sessionId} />
              <input type="hidden" name="sessionDate" value={sessionDate} />
              <input type="hidden" name="sessionStatus" value={sessionStatus} />
              <input type="hidden" name="coach" value={coachId} />
              <input type="hidden" name="students" value={students.map((student) => student.id).join(",")} />
              <input type="hidden" name="payCoach" value={payCoach ? "yes" : "no"} />
              <input type="hidden" name="deductStudentCredit" value={deductCredit ? "yes" : "no"} />

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                <span className="inline-flex items-center gap-1.5 font-bold">
                  <AlertTriangle size={13} /> Class outcome: {sessionStatus.replace(/_/g, " ")}
                </span>
                <p className="mt-1">
                  {coachName} was scheduled to teach {students.length === 1 ? students[0]?.name : `${students.length} students`}.
                  Until this is ruled on, the class is left out of the coach&apos;s pay.
                </p>
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:border-brand/30">
                <input
                  type="checkbox"
                  checked={payCoach}
                  onChange={(event) => setPayCoach(event.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-slate-950">Pay the coach for this class</span>
                  <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                    {payCoach
                      ? `The class is added to ${coachName}'s pay at their normal rate for this batch.`
                      : `${coachName} is not paid for this class.`}
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:border-brand/30">
                <input
                  type="checkbox"
                  checked={deductCredit}
                  onChange={(event) => setDeductCredit(event.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-slate-950">Charge the student a class credit</span>
                  <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                    {deductCredit
                      ? "One credit is taken from each student on this class. Students on a monthly plan are unaffected."
                      : "No credit is taken. If one was already deducted automatically, it is returned."}
                  </span>
                </span>
              </label>

              {students.length > 0 && (
                <div className="rounded-lg bg-slate-50 p-3">
                  <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Students on this class</span>
                  <p className="mt-1 text-xs leading-5 text-slate-700">
                    {students.map((student) => student.name).join(", ")}
                  </p>
                </div>
              )}

              <label className="grid gap-1">
                <span className="text-xs font-semibold text-slate-500">Reason (kept on the record)</span>
                <textarea
                  name="note"
                  defaultValue={existing?.note || ""}
                  rows={3}
                  className="input"
                  placeholder="e.g. Student was unwell and informed us the night before. Coach waited the full hour."
                />
              </label>

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="btn-ghost h-10 px-4">
                  Cancel
                </button>
                <button type="submit" className="btn-primary h-10 px-5">
                  Save ruling
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
