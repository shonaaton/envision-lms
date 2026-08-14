"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Gift, MinusCircle, Search, UserRound, X } from "lucide-react";

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
  mode = "add",
}: {
  students: CreditStudentOption[];
  action: (formData: FormData) => void | Promise<void>;
  mode?: "add" | "remove";
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
    <form action={action} className="grid gap-3 lg:grid-cols-[minmax(240px,1.2fr)_140px_minmax(260px,1.4fr)_auto] lg:items-end">
      <input type="hidden" name="assignment" value={selected?.assignmentId || ""} />
      <div className="relative space-y-1.5">
        <span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Student</span>
        {selected ? (
          <span className={`flex min-h-10 items-center gap-3 rounded-lg border px-3 ${mode === "remove" ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50"}`}>
            <span className={`grid h-7 w-7 flex-none place-items-center rounded-full bg-white ${mode === "remove" ? "text-rose-700" : "text-emerald-700"}`}><Check size={15} /></span>
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
                className="input h-10 pl-9 text-sm"
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
        <span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Credits to {mode === "remove" ? "remove" : "add"}</span>
        <input name="credits" type="number" min="1" max="1000" step="1" required className="input h-10 text-sm" placeholder="1" />
      </label>

      <label className="space-y-1.5">
        <span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Reason <span className="text-rose-600">*</span></span>
        <input
          name="reason"
          minLength={5}
          maxLength={500}
          required
          className="input h-10 text-sm"
          placeholder={mode === "remove" ? "Example: Reversing mistaken manual credit addition" : "Example: Complimentary class after a scheduling issue"}
        />
      </label>

      <SubmitButton studentSelected={Boolean(selected)} mode={mode} />
    </form>
  );
}

function SubmitButton({ studentSelected, mode }: { studentSelected: boolean; mode: "add" | "remove" }) {
  const { pending } = useFormStatus();
  const removing = mode === "remove";
  return (
    <button
      type="submit"
      disabled={!studentSelected || pending}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${removing ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
    >
      {removing ? <MinusCircle size={16} /> : <Gift size={16} />}
      {pending ? (removing ? "Removing..." : "Adding...") : (removing ? "Remove Credits" : "Add Credits")}
    </button>
  );
}
