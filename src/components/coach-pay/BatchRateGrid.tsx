"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Save } from "lucide-react";

import { formatINR } from "@/lib/utils";

type ActionResult = { ok: true; message: string } | { ok: false; error: string };

export type BatchRateRow = {
  /** Batch id, or "" for a classroom with no batch (then `classroomId` is set). */
  batchId: string;
  classroomId: string;
  title: string;
  /** Levels this batch has had, in order, e.g. "Intermediate: Sep 2026". */
  courses: string[];
  isActive: boolean;
  /** Paise per class in force today, or null when none is set. */
  current: number | null;
  /** The dated rates behind it, e.g. "Rs. 500 from 11 Sept 2026". */
  history: string[];
};

function Row({ row, coachId, action }: { row: BatchRateRow; coachId: string; action: (formData: FormData) => Promise<ActionResult> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    <tr className="border-b border-slate-100 align-top last:border-0">
      <td className="px-3 py-2">
        <div className="font-semibold text-slate-950">
          {row.title}
          {row.isActive ? "" : <span className="ml-1 text-xs font-normal text-slate-500">(closed)</span>}
        </div>
        {row.courses.length > 0 && (
          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-slate-600">
            {row.courses.map((course, index) => (
              <span key={`${course}-${index}`} className="flex items-center gap-1">
                {index > 0 && <span className="text-slate-400" aria-label="then">&rarr;</span>}
                <span className="rounded-full bg-brand/[0.06] px-2 py-0.5 font-semibold text-brand">{course}</span>
              </span>
            ))}
          </div>
        )}
        {row.courses.length > 1 && (
          <div className="mt-0.5 text-[11px] text-slate-500">One rate covers every level of this batch.</div>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        {row.current === null ? (
          <span className="text-xs font-bold text-rose-700">Not set</span>
        ) : (
          <span className="font-bold tabular-nums">{formatINR(row.current)}</span>
        )}
        {row.history.map((line) => (
          <div key={line} className={`mt-0.5 text-[11px] ${line.startsWith("No rate yet") ? "font-bold text-rose-700" : "text-slate-500"}`}>
            {line}
          </div>
        ))}
      </td>
      <td className="px-3 py-2">
        <form
          action={(formData) =>
            startTransition(async () => {
              const result = await action(formData);
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              toast.success(result.message);
              setSaved(true);
              router.refresh();
            })
          }
          className="flex flex-wrap items-center justify-end gap-2"
        >
          <input type="hidden" name="coach" value={coachId} />
          <input type="hidden" name="batch" value={row.batchId} />
          <input type="hidden" name="classroom" value={row.classroomId} />
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-500">Rs.</span>
            <input
              name="amount"
              type="number"
              min="0"
              step="any"
              required
              defaultValue={row.current === null ? "" : String(row.current / 100)}
              className="input h-9 w-24 text-right"
              aria-label={`Rate per class for ${row.title}`}
              onChange={() => setSaved(false)}
            />
            <span className="text-xs text-slate-500">/class</span>
          </div>
          <input
            name="from"
            type="month"
            className="input h-9 w-36"
            aria-label="Applies from month (blank for all classes)"
            title="Leave blank to apply to all of this batch's classes"
          />
          <button type="submit" disabled={pending} className="btn-primary h-9 px-3 text-xs">
            <Save size={13} /> {pending ? "Saving" : "Save"}
          </button>
          {saved && !pending && <CheckCircle2 size={16} className="text-emerald-600" aria-label="Saved" />}
        </form>
      </td>
    </tr>
  );
}

export function BatchRateGrid({
  coachId,
  rows,
  action,
}: {
  coachId: string;
  rows: BatchRateRow[];
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  if (!rows.length) return <p className="text-sm text-slate-600">This coach is not assigned to any batches yet.</p>;
  return (
    <div className="overflow-x-auto">
      <p className="mb-2 text-xs text-slate-500">
        Leave the month blank and the rate applies to all of the batch&apos;s classes. Pick a month only when the rate changes from that month.
      </p>
      <table className="min-w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-[0.08em] text-slate-500">
          <tr>
            <th className="border-b border-slate-200 px-3 py-2 font-bold">Batch</th>
            <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Rate now</th>
            <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Set rate per class</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Row key={row.batchId || row.classroomId} row={row} coachId={coachId} action={action} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
