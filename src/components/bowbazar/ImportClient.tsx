"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { monthLabel } from "@/lib/branch/rules";
import { cn } from "@/lib/utils";
import { BranchHeader, ModeBadge, Stat } from "./shared";

type PreviewSlot = { id: string; label: string; mode: string; capacity: number; filled: number; seatedIds: string[] };
type PreviewStudent = {
  regNo: string;
  name: string;
  fatherName: string;
  phone: string;
  className: string;
  active: boolean;
  monthlyFee: number;
  firstMonth: string | null;
  lastMonth: string | null;
  months: number;
  paid: number;
  reportOwed: number;
  listRemaining: number | null;
  existing: { id: string; how: "regNo" | "name" } | null;
  missingCurrentMonth: boolean;
};
type Preview = {
  currentMonth: string;
  alreadyImportedBills: number;
  slots: PreviewSlot[];
  classes: { name: string; active: number; total: number; guess: string[] }[];
  students: PreviewStudent[];
  skipped: { sheet: string; row: number; reason: string }[];
};
type Result = { created: number; linked: number; kept: number; billsCreated: number; billsKept: number };

const inr = (rupees: number) => `₹${Math.round(rupees).toLocaleString("en-IN")}`;
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function ImportClient({ can }: { can: string[] }) {
  const [studentsFile, setStudentsFile] = useState<File | null>(null);
  const [reportFile, setReportFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string[]>>({});
  const [fees, setFees] = useState<Record<string, string>>({});
  const [raiseCurrentMonth, setRaiseCurrentMonth] = useState(true);
  const [busy, setBusy] = useState<"" | "preview" | "commit">("");
  const [result, setResult] = useState<Result | null>(null);
  const [showFormer, setShowFormer] = useState(false);

  function form(action: "preview" | "commit") {
    const data = new FormData();
    data.set("students", studentsFile!);
    data.set("report", reportFile!);
    data.set("action", action);
    return data;
  }

  async function send(action: "preview" | "commit") {
    if (!studentsFile || !reportFile) return toast.error("Choose both files first.");
    setBusy(action);
    try {
      const data = form(action);
      if (action === "commit") {
        const feeOverrides = Object.fromEntries(
          Object.entries(fees).filter(([, value]) => value.trim() !== "").map(([regNo, value]) => [regNo, Number(value.replace(/[,₹\s]/g, ""))])
        );
        data.set("options", JSON.stringify({ mapping, fees: feeOverrides, raiseCurrentMonth }));
      }
      const response = await fetch("/api/bowbazar/import", { method: "POST", body: data });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Could not read the files.");
      if (action === "preview") {
        setPreview(body);
        setResult(null);
        setMapping(Object.fromEntries((body as Preview).classes.map((entry) => [entry.name, entry.guess])));
        setFees({});
      } else {
        setResult(body);
        toast.success("Import finished.");
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy("");
    }
  }

  const current = useMemo(() => preview?.students.filter((student) => student.active) || [], [preview]);
  const former = useMemo(() => preview?.students.filter((student) => !student.active) || [], [preview]);
  const unmapped = (preview?.classes || []).filter((entry) => entry.active > 0 && !(mapping[entry.name] || []).length);

  // Seats after the import: who is already seated, plus every new current student of a class mapped there.
  const occupancy = useMemo(() => {
    const extra = new Map<string, number>();
    for (const student of current) {
      if (student.existing) continue;
      for (const slot of mapping[student.className] || []) extra.set(slot, (extra.get(slot) || 0) + 1);
    }
    return (preview?.slots || []).map((slot) => ({ ...slot, after: slot.filled + (extra.get(slot.id) || 0) }));
  }, [preview, current, mapping]);
  const overfull = occupancy.filter((slot) => slot.after > slot.capacity);
  const missingThisMonth = current.filter((student) => student.missingCurrentMonth && !student.existing);
  const mismatches = current.filter((student) => student.listRemaining !== null && student.listRemaining !== student.reportOwed);

  function toggle(className: string, slotId: string) {
    setMapping((all) => {
      const chosen = all[className] || [];
      return { ...all, [className]: chosen.includes(slotId) ? chosen.filter((id) => id !== slotId) : [...chosen, slotId] };
    });
  }

  return (
    <div className="space-y-4">
      <BranchHeader title="Import from Excel" subtitle="Bring in the student list and the fees report the centre kept before the portal." can={can} />

      <section className="grid gap-3 rounded-lg border border-brand/10 bg-white p-4 shadow-sm md:grid-cols-[1fr_1fr_auto] md:items-end">
        <FilePick label="Student list (current students)" hint="Sr, Reg #, Student Name, Father Name, Class, Fee Remaining, Phone" file={studentsFile} onChange={setStudentsFile} />
        <FilePick label="Fees report" hint="Sr#, Date, Reg No, Student Name, Class, Fee Month, Total, Paid, Balance" file={reportFile} onChange={setReportFile} />
        <button type="button" className="btn-primary h-10" disabled={!studentsFile || !reportFile || Boolean(busy)} onClick={() => send("preview")}>
          {busy === "preview" ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />} Read files
        </button>
      </section>

      {result && (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <div className="flex items-center gap-2 font-black"><CheckCircle2 size={18} /> Import finished</div>
          <ul className="mt-1 list-disc pl-5">
            <li>{count(result.created, "student")} added{result.linked ? `, ${count(result.linked, "student")} matched to records already in the portal by name` : ""}{result.kept ? `, ${count(result.kept, "student")} already imported and left as they were` : ""}.</li>
            <li>{count(result.billsCreated, "monthly fee record")} added{result.billsKept ? `; ${count(result.billsKept, "month")} already had a bill and ${result.billsKept === 1 ? "was" : "were"} kept` : ""}.</li>
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href="/bowbazar/students" className="btn-outline h-9 bg-white">Students</Link>
            <Link href="/bowbazar/fees" className="btn-outline h-9 bg-white">Fees</Link>
            <Link href="/bowbazar/slots" className="btn-outline h-9 bg-white">Slots</Link>
          </div>
          <p className="mt-2 text-xs">Students sign in with the user ID on their row in Students. Use the key button there to make a password to give each family.</p>
        </section>
      )}

      {preview && !result && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Current students" value={current.length} hint={`${current.filter((student) => !student.existing).length} new to the portal`} />
            <Stat label="Former students" value={former.length} hint="In the report only; added as inactive" />
            <Stat label="Monthly fee records" value={preview.students.reduce((sum, student) => sum + student.months, 0)} hint={`${monthLabel(preview.students.map((s) => s.firstMonth || "9999").sort()[0])} onwards`} />
            <Stat label="Owed in the report" value={inr(preview.students.reduce((sum, student) => sum + student.reportOwed, 0))} tone="warn" hint={`${inr(preview.students.reduce((sum, student) => sum + student.paid, 0))} paid in total`} />
          </div>

          {preview.alreadyImportedBills > 0 && (
            <Notice tone="info">This branch already has {preview.alreadyImportedBills} imported fee records. Running the import again only adds what is missing.</Notice>
          )}

          <section className="rounded-lg border border-brand/10 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-base font-black text-slate-950">1. Old classes → slots</h2>
              <p className="text-xs text-slate-500">Each student goes into the slots their class is mapped to. A class that meets on two days takes both. Former-only classes can stay empty.</p>
            </div>
            <div className="divide-y divide-slate-100">
              {preview.classes.map((entry) => {
                const chosen = mapping[entry.name] || [];
                return (
                  <div key={entry.name} className="grid gap-2 px-4 py-3 lg:grid-cols-[260px_1fr]">
                    <div>
                      <div className="font-bold text-slate-900">{entry.name}</div>
                      <div className="text-xs text-slate-500">
                        {entry.active} current · {entry.total - entry.active} former
                        {entry.active > 0 && !chosen.length && <span className="ml-1 font-bold text-amber-700">· choose a slot</span>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {preview.slots.map((slot) => (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => toggle(entry.name, slot.id)}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold",
                            chosen.includes(slot.id) ? "border-brand bg-brand text-white" : "border-slate-200 text-slate-600 hover:border-brand/40"
                          )}
                        >
                          {slot.label}
                          {slot.mode === "online" && !chosen.includes(slot.id) && <ModeBadge mode="online" />}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {overfull.length > 0 && (
            <Notice tone="warn">
              {overfull.map((slot) => `${slot.label} would have ${slot.after} students (seats: ${slot.capacity})`).join("; ")}. The import still goes ahead; move students afterwards, or split the class across two slots above.
            </Notice>
          )}

          <section className="overflow-x-auto rounded-lg border border-brand/10 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-base font-black text-slate-950">2. Current students and their monthly fee</h2>
              <p className="text-xs text-slate-500">The fee is the amount they usually paid after their first month. Change any that are wrong; leave the box empty to keep the suggestion.</p>
            </div>
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Student</th>
                  <th className="px-4 py-2">Class</th>
                  <th className="px-4 py-2">Months</th>
                  <th className="px-4 py-2">Monthly fee</th>
                  <th className="px-4 py-2 text-right">Owed (report)</th>
                  <th className="px-4 py-2 text-right">List says</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {current.map((student) => {
                  const mismatch = student.listRemaining !== null && student.listRemaining !== student.reportOwed;
                  return (
                    <tr key={student.regNo} className={cn(student.existing && "bg-slate-50 text-slate-500")}>
                      <td className="px-4 py-2">
                        <div className="font-bold text-slate-900">{student.name}</div>
                        <div className="text-xs text-slate-500">
                          {student.regNo} · {student.phone || "no phone"}
                          {student.existing && <span className="ml-1 font-bold">· already in the portal{student.existing.how === "name" ? " (matched by name)" : ""}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-xs">{student.className}</td>
                      <td className="px-4 py-2 text-xs">
                        {student.firstMonth ? `${monthLabel(student.firstMonth)} – ${monthLabel(student.lastMonth!)}` : "None"}
                        {student.missingCurrentMonth && !student.existing && <div className="font-bold text-amber-700">No {monthLabel(preview.currentMonth).split(" ")[0]} bill yet</div>}
                      </td>
                      <td className="px-4 py-2">
                        <input
                          className="input h-8 w-24 text-sm"
                          inputMode="numeric"
                          disabled={Boolean(student.existing)}
                          placeholder={String(student.monthlyFee)}
                          value={fees[student.regNo] ?? ""}
                          onChange={(event) => setFees((all) => ({ ...all, [student.regNo]: event.target.value }))}
                        />
                      </td>
                      <td className={cn("px-4 py-2 text-right font-bold", student.reportOwed ? "text-red-700" : "text-slate-400")}>{inr(student.reportOwed)}</td>
                      <td className={cn("px-4 py-2 text-right", mismatch ? "font-bold text-amber-700" : "text-slate-400")}>
                        {student.listRemaining === null ? "—" : student.listRemaining ? inr(student.listRemaining) : "Paid"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {mismatches.length > 0 && (
            <Notice tone="warn">
              The student list and the fees report disagree for {mismatches.map((student) => `${student.name} (list ${student.listRemaining ? inr(student.listRemaining) : "Paid"}, report ${inr(student.reportOwed)})`).join("; ")}.
              The import follows the report month by month. Fix the odd month afterwards on the Fees page with Details → waive or record payment.
            </Notice>
          )}

          <section className="rounded-lg border border-brand/10 bg-white shadow-sm">
            <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left" onClick={() => setShowFormer((value) => !value)}>
              <span>
                <span className="text-base font-black text-slate-950">3. Former students ({former.length})</span>
                <span className="block text-xs text-slate-500">Added as inactive with their fee history, so old dues stay on record. They do not take a seat.</span>
              </span>
              <span className="text-xs font-bold text-brand">{showFormer ? "Hide" : "Show"}</span>
            </button>
            {showFormer && (
              <div className="divide-y divide-slate-100 border-t border-slate-100">
                {former.map((student) => (
                  <div key={student.regNo} className="flex justify-between gap-2 px-4 py-2 text-sm">
                    <span>
                      <span className="font-bold">{student.name}</span> <span className="text-xs text-slate-500">{student.regNo} · {student.className}</span>
                    </span>
                    <span className="text-xs text-slate-600">
                      {student.firstMonth && `${monthLabel(student.firstMonth)} – ${monthLabel(student.lastMonth!)}`}
                      {student.reportOwed > 0 && <span className="ml-2 font-bold text-red-700">owes {inr(student.reportOwed)}</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {preview.skipped.length > 0 && (
            <Notice tone="warn">
              <div className="font-bold">Rows that will not be imported ({preview.skipped.length})</div>
              <ul className="mt-1 list-disc pl-5">
                {preview.skipped.map((entry) => <li key={`${entry.sheet}-${entry.row}`}>{entry.sheet === "report" ? "Fees report" : "Student list"} row {entry.row}: {entry.reason}</li>)}
              </ul>
            </Notice>
          )}

          <section className="space-y-3 rounded-lg border border-brand/10 bg-white p-4 shadow-sm">
            {missingThisMonth.length > 0 && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={raiseCurrentMonth} onChange={(event) => setRaiseCurrentMonth(event.target.checked)} />
                <span>
                  <span className="font-bold">Raise the {monthLabel(preview.currentMonth)} fee for the {missingThisMonth.length} current students the report has not billed yet</span>
                  <span className="block text-xs text-slate-500">{missingThisMonth.map((student) => student.name).join(", ")}. Untick if they have paid {monthLabel(preview.currentMonth).split(" ")[0]} some other way; billing then starts next month.</span>
                </span>
              </label>
            )}
            {unmapped.length > 0 && (
              <p className="text-sm font-semibold text-amber-800">
                {unmapped.map((entry) => entry.name).join(", ")} {unmapped.length === 1 ? "has" : "have"} no slot. Those students will be added without a slot; you can set it later.
              </p>
            )}
            <button type="button" className="btn-primary h-11" disabled={Boolean(busy)} onClick={() => send("commit")}>
              {busy === "commit" && <Loader2 size={16} className="animate-spin" />} Import {count(current.filter((s) => !s.existing).length + former.filter((s) => !s.existing).length, "student")} and their fees
            </button>
          </section>
        </>
      )}
    </div>
  );
}

function FilePick({ label, hint, file, onChange }: { label: string; hint: string; file: File | null; onChange: (file: File | null) => void }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-bold text-slate-600">{label}</span>
      <input type="file" accept=".xlsx,.xls,.csv" className="input py-1.5 text-sm" onChange={(event) => onChange(event.target.files?.[0] || null)} />
      <span className="block text-[11px] text-slate-400">{file ? `${file.name} · ${Math.ceil(file.size / 1024)} KB` : hint}</span>
    </label>
  );
}

function Notice({ tone, children }: { tone: "warn" | "info"; children: React.ReactNode }) {
  return (
    <div className={cn("flex gap-2 rounded-lg border p-3 text-sm", tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-sky-200 bg-sky-50 text-sky-900")}>
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
