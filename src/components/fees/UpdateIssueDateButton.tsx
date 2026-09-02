"use client";

import { useState } from "react";
import { CalendarClock, X } from "lucide-react";

type ServerAction = (formData: FormData) => Promise<void>;

function dateInputValue(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function UpdateIssueDateButton({
  invoiceId,
  invoiceNumber,
  studentFilter,
  currentIssueDate,
  dueDate,
  action,
}: {
  invoiceId: string;
  invoiceNumber: string;
  studentFilter: string;
  currentIssueDate?: string;
  dueDate?: string;
  action: ServerAction;
}) {
  const [open, setOpen] = useState(false);
  const [issueDate, setIssueDate] = useState(dateInputValue(currentIssueDate) || dateInputValue(dueDate));
  const [nextDueDate, setNextDueDate] = useState(dateInputValue(dueDate));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Update invoice dates"
        aria-label="Update invoice dates"
        className="grid h-8 w-8 place-items-center rounded-lg border border-sky-200 bg-white text-sky-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-sky-50 hover:shadow-md"
      >
        <CalendarClock size={14} />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6">
          <form action={action} className="w-full max-w-md rounded-lg bg-white p-4 shadow-2xl">
            <input type="hidden" name="invoice" value={invoiceId} />
            <input type="hidden" name="studentFilter" value={studentFilter} />
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-950">Update Invoice Dates</h3>
                <p className="mt-1 text-sm text-slate-500">Adjust the issue date and payment due date shown on this record and PDF.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 text-slate-600">
                <X size={16} />
              </button>
            </div>

            <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="font-bold text-slate-950">{invoiceNumber || "Invoice"}</div>
              <div className="mt-1 text-slate-600">Current issue date: {dateInputValue(currentIssueDate) || "-"}</div>
              <div className="text-slate-600">Due date: {dateInputValue(dueDate) || "-"}</div>
            </div>

            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Issue Date</span>
              <input
                name="issueDate"
                type="date"
                required
                value={issueDate}
                onChange={(event) => setIssueDate(event.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
              />
            </label>

            <label className="mt-3 block space-y-1">
              <span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Due Date</span>
              <input
                name="dueDate"
                type="date"
                required
                value={nextDueDate}
                onChange={(event) => setNextDueDate(event.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
              />
            </label>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setIssueDate(nextDueDate)}
                className="inline-flex h-9 items-center rounded-md border border-sky-200 px-3 text-sm font-bold text-sky-700"
              >
                Use Due Date as Issue Date
              </button>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="inline-flex h-10 items-center rounded-md border border-slate-200 px-4 text-sm font-bold text-slate-700">
                Cancel
              </button>
              <button disabled={!issueDate} className="inline-flex h-10 items-center gap-2 rounded-md bg-sky-700 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
                <CalendarClock size={15} /> Save Dates
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
