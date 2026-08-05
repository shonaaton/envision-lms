"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Gift, Search, UserRound, X } from "lucide-react";

type CreditStudentOption = {
  assignmentId: string;
  studentId: string;
  name: string;
  username: string;
  email: string;
  balance: number;
};

export default function ManualCreditForm({
  students,
  action,
}: {
  students: CreditStudentOption[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CreditStudentOption | null>(null);
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? students.filter((student) => `${student.name} ${student.username} ${student.email}`.toLowerCase().includes(needle))
      : students;
    return filtered.slice(0, 10);
  }, [query, students]);

  function chooseStudent(student: CreditStudentOption) {
    setSelected(student);
    setQuery(student.name);
    setOpen(false);
  }

  return (
    <form action={action} className="grid gap-4 lg:grid-cols-[minmax(260px,1.2fr)_150px_minmax(280px,1.4fr)_auto] lg:items-end">
      <input type="hidden" name="assignment" value={selected?.assignmentId || ""} />
      <div className="relative space-y-1.5">
        <span className="text-xs font-black uppercase tracking-[0.1em] text-slate-600">Student</span>
        {selected ? (
          <span className="flex min-h-11 items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3">
            <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-white text-emerald-700"><Check size={15} /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-slate-950">{selected.name}</span>
              <span className="block truncate text-xs text-slate-500">{selected.username || selected.email} · {selected.balance} credits available</span>
            </span>
            <button
              type="button"
              onClick={() => { setSelected(null); setQuery(""); setOpen(true); }}
              className="grid h-7 w-7 flex-none place-items-center rounded-md text-slate-500 hover:bg-white hover:text-rose-600"
              aria-label="Change selected student"
              title="Change student"
            >
              <X size={14} />
            </button>
          </span>
        ) : (
          <>
            <span className="relative block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                value={query}
                onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onBlur={() => window.setTimeout(() => setOpen(false), 100)}
                className="input h-11 pl-9"
                placeholder="Search name, student ID, or email"
                autoComplete="off"
                aria-label="Search for a student"
              />
            </span>
            {open && (
              <span className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
                {matches.length ? matches.map((student) => (
                  <button
                    key={student.assignmentId}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => chooseStudent(student)}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition hover:bg-purple-50"
                  >
                    <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-purple-100 text-purple-700"><UserRound size={15} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-slate-950">{student.name}</span>
                      <span className="block truncate text-xs text-slate-500">{student.username || student.email}</span>
                    </span>
                    <span className="flex-none rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">{student.balance} credits</span>
                  </button>
                )) : (
                  <span className="block px-3 py-5 text-center text-sm text-slate-500">No credit-plan student matches this search.</span>
                )}
              </span>
            )}
          </>
        )}
      </div>

      <label className="space-y-1.5">
        <span className="text-xs font-black uppercase tracking-[0.1em] text-slate-600">Credits to add</span>
        <input name="credits" type="number" min="1" max="1000" step="1" required className="input h-11" placeholder="1" />
      </label>

      <label className="space-y-1.5">
        <span className="text-xs font-black uppercase tracking-[0.1em] text-slate-600">Reason <span className="text-rose-600">*</span></span>
        <input name="reason" minLength={5} maxLength={500} required className="input h-11" placeholder="Example: Complimentary class after a scheduling issue" />
      </label>

      <SubmitButton studentSelected={Boolean(selected)} />
    </form>
  );
}

function SubmitButton({ studentSelected }: { studentSelected: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={!studentSelected || pending}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Gift size={16} /> {pending ? "Adding…" : "Add Credits"}
    </button>
  );
}
