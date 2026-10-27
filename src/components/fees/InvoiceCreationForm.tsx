"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileText,
  Layers,
  ListChecks,
  Loader2,
  PenLine,
  Plus,
  Receipt,
  RotateCcw,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { invoiceBreakup, type InvoiceTaxMode } from "@/lib/invoiceMath";

type StudentOption = { id: string; name: string; username?: string; isActive?: boolean };
type PlanOption = { id: string; name: string; type: "monthly" | "credits"; amount: number; credits: number; gstMode?: InvoiceTaxMode; gstPercentage?: number };
type AssignmentOption = { studentId: string; planId: string };

export type CreatedInvoiceSummary = {
  id: string;
  invoiceNumber: string;
  title: string;
  totalAmount: number;
  invoiceMode: string;
  createdAt: string;
  studentId: string;
  studentName: string;
  alreadyCreated?: boolean;
};

export type CreateInvoiceResult =
  | { status: "created"; invoice: CreatedInvoiceSummary }
  | { status: "duplicate"; matches: CreatedInvoiceSummary[] }
  | { status: "error"; error: string };

type Source = "plan" | "custom";

const GST_RATES = [5, 12, 18, 28];

const TAX_OPTIONS: Array<{ value: InvoiceTaxMode; label: string; help: string }> = [
  { value: "included", label: "GST included", help: "The amount is the final price. GST is taken out of it, never added." },
  { value: "excluded", label: "Add GST on top", help: "The amount is the base price. GST is added to it." },
  { value: "non_gst", label: "No GST", help: "Non-GST invoice with no tax lines." },
];

function currency(paise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(paise / 100);
}

function localDateKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function addDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return localDateKey(new Date(year, (month || 1) - 1, (day || 1) + days));
}

function newCreationKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function timeAgo(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}

function taxModeLabel(mode?: string) {
  if (mode === "included") return "GST included";
  if (mode === "excluded") return "GST extra";
  return "Non-GST";
}

function SectionTitle({ step, title, hint }: { step: number; title: string; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-2.5">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-black text-white">{step}</span>
      <div>
        <h3 className="text-sm font-bold text-slate-950">{title}</h3>
        {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
      </div>
    </div>
  );
}

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-bold text-slate-600">{children}</label>;
}

const inputClass =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-brand focus:ring-4 focus:ring-brand/10 disabled:bg-slate-50";

function StudentPicker({
  students,
  selected,
  onSelect,
}: {
  students: StudentOption[];
  selected?: StudentOption;
  onSelect: (student: StudentOption | undefined) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = needle
      ? students.filter((student) => student.name.toLowerCase().includes(needle) || String(student.username || "").toLowerCase().includes(needle))
      : students;
    return list.slice(0, 8);
  }, [students, query]);

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-brand/30 bg-brand-50 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-sm font-black text-white">{selected.name.slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-slate-950">{selected.name}</div>
            <div className="truncate text-xs text-slate-500">{selected.username || "No username"}{selected.isActive === false ? " · inactive" : ""}</div>
          </div>
        </div>
        <button type="button" onClick={() => { onSelect(undefined); setQuery(""); }} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:border-brand/30 hover:text-brand">
          <RotateCcw size={13} /> Change
        </button>
      </div>
    );
  }

  function choose(student: StudentOption) {
    onSelect(student);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="relative">
      <Search size={16} className="pointer-events-none absolute left-3 top-3 text-slate-400" />
      <input
        value={query}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls="invoice-student-options"
        aria-label="Search student"
        placeholder={`Search ${students.length} students by name or username`}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => { setQuery(event.target.value); setHighlight(0); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); setHighlight((value) => Math.min(matches.length - 1, value + 1)); }
          if (event.key === "ArrowUp") { event.preventDefault(); setHighlight((value) => Math.max(0, value - 1)); }
          if (event.key === "Enter") { event.preventDefault(); if (matches[highlight]) choose(matches[highlight]); }
          if (event.key === "Escape") setOpen(false);
        }}
        className={`${inputClass} h-11 pl-9`}
      />
      {open ? (
        <ul id="invoice-student-options" role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl shadow-slate-900/10">
          {matches.length === 0 ? (
            <li className="px-3 py-3 text-sm text-slate-500">No student matches “{query}”.</li>
          ) : (
            matches.map((student, index) => (
              <li
                key={student.id}
                role="option"
                aria-selected={index === highlight}
                onMouseDown={(event) => { event.preventDefault(); choose(student); }}
                onMouseEnter={() => setHighlight(index)}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm ${index === highlight ? "bg-brand-50 text-brand" : "text-slate-800"}`}
              >
                <span className="truncate font-semibold">{student.name}</span>
                <span className="shrink-0 text-xs text-slate-500">{student.username}{student.isActive === false ? " · inactive" : ""}</span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

export function InvoiceCreationForm({
  students,
  plans,
  assignments,
  action,
  createdInvoice,
  initialStudentId,
}: {
  students: StudentOption[];
  plans: PlanOption[];
  assignments: AssignmentOption[];
  action: (formData: FormData) => Promise<CreateInvoiceResult>;
  createdInvoice?: CreatedInvoiceSummary | null;
  initialStudentId?: string;
}) {
  const router = useRouter();
  const today = localDateKey();
  const startStudent = students.some((item) => item.id === initialStudentId) ? String(initialStudentId) : "";
  const [studentId, setStudentId] = useState(startStudent);
  const [source, setSource] = useState<Source>(() => (startStudent && assignments.some((item) => item.studentId === startStudent) ? "plan" : "custom"));
  const [planId, setPlanId] = useState("");
  const [amount, setAmount] = useState("");
  const [taxMode, setTaxMode] = useState<InvoiceTaxMode>("included");
  const [gstRate, setGstRate] = useState("18");
  const [customTitle, setCustomTitle] = useState<string | null>(null);
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDate, setDueDate] = useState(addDays(today, 7));
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [creationKey, setCreationKey] = useState(newCreationKey);
  const [error, setError] = useState("");
  const [duplicates, setDuplicates] = useState<CreatedInvoiceSummary[]>([]);
  const [created, setCreated] = useState<CreatedInvoiceSummary | null>(createdInvoice || null);
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);

  const student = students.find((item) => item.id === studentId);
  const studentPlans = useMemo(() => {
    const assigned = new Set(assignments.filter((item) => item.studentId === studentId).map((item) => item.planId));
    return plans.filter((plan) => assigned.has(plan.id));
  }, [assignments, plans, studentId]);
  const plan = source === "plan" ? studentPlans.find((item) => item.id === planId) : undefined;

  const amountPaise = Math.round(Number(amount || 0) * 100);
  const rate = taxMode === "non_gst" ? 0 : Number(gstRate || 0);
  const breakup = invoiceBreakup(Number.isFinite(amountPaise) ? amountPaise : 0, 0, {}, { gstMode: taxMode, gstPercentage: rate });

  const autoTitle = useMemo(() => {
    if (!student) return "";
    const month = new Date(`${invoiceDate || today}T00:00:00`).toLocaleString("en-IN", { month: "long", year: "numeric" });
    return `${student.name} - ${plan ? plan.name : "Custom Invoice"} - ${month}`;
  }, [student, plan, invoiceDate, today]);
  const title = customTitle ?? autoTitle;

  const missing: string[] = [];
  if (!student) missing.push("Choose a student");
  if (source === "plan" && !plan) missing.push("Pick a plan");
  if (!(amountPaise > 0)) missing.push("Enter the amount");
  if (taxMode !== "non_gst" && !(rate > 0 && rate <= 100)) missing.push("Enter the GST rate");
  if (!invoiceDate || !dueDate) missing.push("Set both dates");
  else if (dueDate < invoiceDate) missing.push("Due date is before the invoice date");
  if (!title.trim()) missing.push("Add a title");
  const ready = missing.length === 0;

  function clearFeedback() {
    setError("");
    setDuplicates([]);
  }

  function selectStudent(next: StudentOption | undefined) {
    clearFeedback();
    setStudentId(next?.id || "");
    setPlanId("");
    setCustomTitle(null);
    const assigned = next ? assignments.filter((item) => item.studentId === next.id).length : 0;
    setSource(assigned > 0 ? "plan" : "custom");
  }

  function choosePlan(next: PlanOption) {
    clearFeedback();
    setPlanId(next.id);
    setAmount(String(next.amount / 100));
    setTaxMode(next.gstMode || "non_gst");
    setGstRate(String(next.gstPercentage || 18));
    setCustomTitle(null);
  }

  function chooseSource(next: Source) {
    clearFeedback();
    setSource(next);
    setPlanId("");
    setCustomTitle(null);
    if (next === "custom") setAmount("");
  }

  function resetForm(keepStudent: boolean) {
    // The page keys this form on the created invoice, so leaving the
    // ?created= URL mounts a fresh form with a new creation key.
    const studentToKeep = keepStudent ? created?.studentId : "";
    router.replace(studentToKeep ? `/fees/invoices/new?for=${encodeURIComponent(studentToKeep)}` : "/fees/invoices/new", { scroll: false });
  }

  function submit(confirmDuplicate = false) {
    if (!ready || inFlight.current || pending) return;
    inFlight.current = true;
    setError("");
    const formData = new FormData();
    formData.set("creationKey", creationKey);
    formData.set("student", studentId);
    formData.set("plan", plan?.id || "");
    formData.set("amount", amount);
    formData.set("invoiceMode", taxMode);
    formData.set("gstPercentage", String(rate));
    formData.set("title", title.trim());
    formData.set("invoiceDate", invoiceDate);
    formData.set("dueDate", dueDate);
    formData.set("referenceNumber", referenceNumber.trim());
    formData.set("notes", notes.trim());
    if (confirmDuplicate) formData.set("confirmDuplicate", "1");
    startTransition(async () => {
      try {
        const result = await action(formData);
        if (result.status === "created") {
          setDuplicates([]);
          setCreated(result.invoice);
          // Saving refreshes the page, which remounts this form. The URL keeps
          // the confirmation on screen and highlights the invoice in the list.
          router.replace(`/fees/invoices/new?created=${result.invoice.id}`, { scroll: false });
        } else if (result.status === "duplicate") {
          setDuplicates(result.matches);
        } else {
          setError(result.error);
        }
      } catch {
        setError("Could not reach the server. Check the invoice list before trying again.");
      } finally {
        inFlight.current = false;
      }
    });
  }

  if (created) {
    const pdfHref = `/api/fees/invoices/${created.id}/pdf`;
    const listHref = `/fees/invoices?student=${encodeURIComponent(created.studentId)}&highlight=${encodeURIComponent(created.id)}`;
    return (
      <div className="overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-sm shadow-emerald-900/5">
        <div className="flex flex-col gap-4 bg-emerald-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-600 text-white"><CheckCircle2 size={22} /></span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700">{created.alreadyCreated ? "Already created" : "Invoice created"}</p>
              <h2 className="text-xl font-bold text-slate-950">{created.invoiceNumber}</h2>
              <p className="mt-0.5 text-sm text-slate-600">{created.studentName ? `${created.studentName} · ` : ""}{created.title}</p>
              {created.alreadyCreated ? <p className="mt-1 text-xs font-semibold text-emerald-800">This request had already gone through, so no second invoice was made.</p> : null}
            </div>
          </div>
          <div className="rounded-lg bg-white px-4 py-2.5 text-right shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Total payable · {taxModeLabel(created.invoiceMode)}</div>
            <div className="text-2xl font-black text-slate-950">{currency(created.totalAmount)}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 p-4">
          <a href={pdfHref} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"><Eye size={15} /> View invoice PDF</a>
          <a href={listHref} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:border-brand/30 hover:text-brand"><ListChecks size={15} /> Open in invoice list to send or record payment</a>
          {created.studentName ? (
            <button type="button" onClick={() => resetForm(true)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:border-brand/30 hover:text-brand"><Plus size={15} /> Another for {created.studentName.split(" ")[0]}</button>
          ) : null}
          <button type="button" onClick={() => resetForm(false)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:border-brand/30 hover:text-brand"><RotateCcw size={15} /> New invoice</button>
        </div>
      </div>
    );
  }

  const amountLabel = taxMode === "included" ? "Final amount the student pays (GST inside)" : taxMode === "excluded" ? "Base amount before GST" : "Amount";

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm shadow-brand-900/5">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-brand/10 text-brand"><Receipt size={18} /></span>
        <div>
          <h2 className="text-base font-semibold text-slate-950">Create invoice</h2>
          <p className="text-xs text-slate-500">Bill a student from an assigned plan or with a custom amount. The total and GST breakup you see are exactly what gets saved.</p>
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_340px]">
        <fieldset disabled={pending} className="min-w-0 space-y-6 p-4 disabled:opacity-70">
          <section>
            <SectionTitle step={1} title="Student" />
            <StudentPicker students={students} selected={student} onSelect={selectStudent} />
          </section>

          <section className={student ? "" : "pointer-events-none opacity-50"}>
            <SectionTitle step={2} title="What are you billing?" />
            <div className="grid gap-2 sm:grid-cols-2">
              {([
                ["plan", Layers, "From an assigned plan", studentPlans.length ? `${studentPlans.length} plan${studentPlans.length === 1 ? "" : "s"} assigned` : "No plan assigned to this student"],
                ["custom", PenLine, "Custom invoice", "Any amount: adjustments, events, offline billing"],
              ] as const).map(([value, Icon, label, help]) => {
                const disabled = value === "plan" && studentPlans.length === 0;
                const active = source === value;
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={disabled}
                    onClick={() => chooseSource(value)}
                    className={`flex items-start gap-3 rounded-lg border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${active ? "border-brand bg-brand-50 ring-2 ring-brand/10" : "border-slate-200 bg-white hover:border-brand/30"}`}
                  >
                    <Icon size={18} className={active ? "mt-0.5 text-brand" : "mt-0.5 text-slate-400"} />
                    <span>
                      <span className={`block text-sm font-bold ${active ? "text-brand" : "text-slate-950"}`}>{label}</span>
                      <span className="block text-xs text-slate-500">{help}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {source === "plan" && studentPlans.length > 0 ? (
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {studentPlans.map((item) => {
                  const active = item.id === planId;
                  const planTotal = invoiceBreakup(item.amount, 0, {}, { gstMode: item.gstMode || "non_gst", gstPercentage: item.gstPercentage || 0 }).totalAmount;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => choosePlan(item)}
                      className={`rounded-lg border p-3 text-left transition ${active ? "border-brand bg-brand-50 ring-2 ring-brand/10" : "border-slate-200 bg-white hover:border-brand/30"}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-bold text-slate-950">{item.name}</span>
                        {active ? <CheckCircle2 size={16} className="shrink-0 text-brand" /> : null}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{item.type === "monthly" ? "Monthly" : `${item.credits} credits`}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{taxModeLabel(item.gstMode)}{item.gstMode && item.gstMode !== "non_gst" ? ` ${item.gstPercentage || 0}%` : ""}</span>
                        <span className="ml-auto text-sm font-black text-slate-950">{currency(planTotal)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </section>

          <section className={student ? "" : "pointer-events-none opacity-50"}>
            <SectionTitle step={3} title="Amount and GST" hint={plan ? "Filled in from the plan. Change anything that is different this time." : undefined} />
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="GST treatment">
              {TAX_OPTIONS.map((option) => {
                const active = taxMode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => { clearFeedback(); setTaxMode(option.value); }}
                    className={`rounded-lg border p-3 text-left transition ${active ? "border-brand bg-brand-50 ring-2 ring-brand/10" : "border-slate-200 bg-white hover:border-brand/30"}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className={`grid h-4 w-4 place-items-center rounded-full border-2 ${active ? "border-brand" : "border-slate-300"}`}>{active ? <span className="h-1.5 w-1.5 rounded-full bg-brand" /> : null}</span>
                      <span className={`text-sm font-bold ${active ? "text-brand" : "text-slate-950"}`}>{option.label}</span>
                    </span>
                    <span className="mt-1 block text-xs leading-4 text-slate-500">{option.help}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div>
                <Label htmlFor="invoice-amount">{amountLabel}</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-2.5 text-sm font-bold text-slate-400">₹</span>
                  <input
                    id="invoice-amount"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(event) => { clearFeedback(); setAmount(event.target.value); }}
                    placeholder="0"
                    className={`${inputClass} pl-7 text-base font-bold`}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="invoice-gst-rate">GST rate</Label>
                <div className="flex gap-1.5">
                  {GST_RATES.map((value) => (
                    <button
                      key={value}
                      type="button"
                      disabled={taxMode === "non_gst"}
                      onClick={() => { clearFeedback(); setGstRate(String(value)); }}
                      className={`h-10 min-w-0 flex-1 rounded-lg border text-xs font-bold transition sm:text-sm disabled:opacity-40 ${taxMode !== "non_gst" && Number(gstRate) === value ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-700 hover:border-brand/30"}`}
                    >
                      {value}%
                    </button>
                  ))}
                  <input
                    id="invoice-gst-rate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    aria-label="Custom GST rate"
                    disabled={taxMode === "non_gst"}
                    value={taxMode === "non_gst" ? "" : gstRate}
                    onChange={(event) => { clearFeedback(); setGstRate(event.target.value); }}
                    className={`${inputClass.replace("w-full", "w-20")} shrink-0 text-center`}
                  />
                </div>
              </div>
            </div>
            {amountPaise > 0 ? (
              <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 text-sm" aria-label="GST breakup">
                <div className="flex items-center justify-between bg-slate-50 px-3 py-2">
                  <span className="font-bold text-slate-950">Invoice total</span>
                  <span className="text-lg font-black text-slate-950">{currency(breakup.totalAmount)}</span>
                </div>
                <div className="divide-y divide-slate-100 px-3">
                  <div className="flex justify-between py-1.5"><span className="text-slate-500">Base amount (taxable value)</span><span className="font-semibold text-slate-800">{currency(breakup.taxableAmount)}</span></div>
                  {taxMode !== "non_gst" ? (
                    <>
                      <div className="flex justify-between py-1.5"><span className="text-slate-500">CGST @ {rate / 2}%</span><span className="text-slate-800">{currency(breakup.cgstAmount)}</span></div>
                      <div className="flex justify-between py-1.5"><span className="text-slate-500">SGST @ {rate / 2}%</span><span className="text-slate-800">{currency(breakup.sgstAmount)}</span></div>
                    </>
                  ) : (
                    <div className="flex justify-between py-1.5"><span className="text-slate-500">GST</span><span className="text-slate-400">Not applicable</span></div>
                  )}
                </div>
              </div>
            ) : null}
          </section>

          <section className={student ? "" : "pointer-events-none opacity-50"}>
            <SectionTitle step={4} title="Invoice details" />
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label htmlFor="invoice-title">Title on the invoice</Label>
                <div className="relative">
                  <input id="invoice-title" value={title} onChange={(event) => setCustomTitle(event.target.value)} placeholder="Choose a student to suggest a title" className={`${inputClass} pr-16`} />
                  {customTitle !== null && autoTitle ? (
                    <button type="button" onClick={() => setCustomTitle(null)} className="absolute right-2 top-2 rounded-md px-2 py-1 text-[11px] font-bold text-brand hover:bg-brand-50">Reset</button>
                  ) : null}
                </div>
              </div>
              <div>
                <Label htmlFor="invoice-date">Invoice date</Label>
                <input id="invoice-date" type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} className={inputClass} />
              </div>
              <div>
                <Label htmlFor="invoice-due-date">Due date</Label>
                <input id="invoice-due-date" type="date" value={dueDate} min={invoiceDate} onChange={(event) => setDueDate(event.target.value)} className={inputClass} />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {[["Same day", 0], ["+7 days", 7], ["+15 days", 15], ["+30 days", 30]].map(([label, days]) => {
                    const value = addDays(invoiceDate || today, Number(days));
                    return (
                      <button key={label} type="button" onClick={() => setDueDate(value)} className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${dueDate === value ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-brand-50 hover:text-brand"}`}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label htmlFor="invoice-reference">Reference number <span className="font-normal text-slate-400">(optional)</span></Label>
                <input id="invoice-reference" value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} placeholder="Receipt, transfer or PO number" className={inputClass} />
              </div>
              <div>
                <Label htmlFor="invoice-notes">Line description <span className="font-normal text-slate-400">(optional, printed on the invoice)</span></Label>
                <input id="invoice-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="e.g. Tournament entry, Oct 2026" className={inputClass} />
              </div>
            </div>
          </section>
        </fieldset>

        <aside className="border-t border-slate-100 bg-slate-50/70 p-4 xl:border-l xl:border-t-0">
          <div className="space-y-3 xl:sticky xl:top-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500"><FileText size={13} /> Invoice preview</div>
              <div className="mt-3 space-y-0.5">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-950"><UserRound size={14} className="text-slate-400" /> {student?.name || "No student yet"}</div>
                <div className="line-clamp-2 text-xs text-slate-500">{title || "—"}</div>
              </div>
              <dl className="mt-4 space-y-1.5 border-t border-dashed border-slate-200 pt-3 text-sm">
                <div className="flex justify-between"><dt className="text-slate-500">Base amount</dt><dd className="font-semibold text-slate-800">{currency(breakup.taxableAmount)}</dd></div>
                {taxMode !== "non_gst" ? (
                  <>
                    <div className="flex justify-between"><dt className="text-slate-500">CGST {rate / 2}%</dt><dd className="text-slate-800">{currency(breakup.cgstAmount)}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate-500">SGST {rate / 2}%</dt><dd className="text-slate-800">{currency(breakup.sgstAmount)}</dd></div>
                  </>
                ) : (
                  <div className="flex justify-between"><dt className="text-slate-500">GST</dt><dd className="text-slate-400">Not applicable</dd></div>
                )}
              </dl>
              <div className="mt-3 flex items-end justify-between border-t border-slate-200 pt-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Total payable</div>
                  <div className="text-[11px] font-semibold text-brand">{taxModeLabel(taxMode)}{taxMode !== "non_gst" ? ` · ${rate}%` : ""}</div>
                </div>
                <div className="text-2xl font-black text-slate-950">{currency(breakup.totalAmount)}</div>
              </div>
              {taxMode === "included" && amountPaise > 0 ? (
                <p className="mt-2 rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800">GST is inside {currency(amountPaise)}. Nothing is added on top.</p>
              ) : null}
              {taxMode === "excluded" && amountPaise > 0 ? (
                <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800">{currency(breakup.gstAmount)} GST is added on top of {currency(amountPaise)}.</p>
              ) : null}
            </div>

            {duplicates.length ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
                <div className="flex items-center gap-2 text-sm font-bold text-amber-900"><AlertTriangle size={16} /> This looks like a repeat</div>
                <p className="mt-1 text-xs text-amber-800">{student?.name} already has {duplicates.length === 1 ? "an invoice" : `${duplicates.length} invoices`} for {currency(breakup.totalAmount)} from the last 24 hours:</p>
                <ul className="mt-2 space-y-1">
                  {duplicates.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-2 rounded-md bg-white px-2.5 py-1.5 text-xs">
                      <span className="min-w-0">
                        <span className="block font-bold text-slate-900">{item.invoiceNumber}</span>
                        <span className="block text-slate-500">{timeAgo(item.createdAt)}</span>
                      </span>
                      <a href={`/api/fees/invoices/${item.id}/pdf`} target="_blank" rel="noreferrer" className="shrink-0 font-bold text-brand hover:underline">Open</a>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => setDuplicates([])} className="h-9 flex-1 rounded-lg border border-amber-300 bg-white text-xs font-bold text-amber-900">Don&apos;t create</button>
                  <button type="button" disabled={pending} onClick={() => submit(true)} className="h-9 flex-1 rounded-lg bg-amber-600 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-60">Create anyway</button>
                </div>
              </div>
            ) : null}

            {error ? (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span className="flex-1">{error}</span>
                <button type="button" aria-label="Dismiss" onClick={() => setError("")}><X size={14} /></button>
              </div>
            ) : null}

            {!duplicates.length ? (
              <button
                type="button"
                disabled={!ready || pending}
                onClick={() => submit(false)}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-bold text-white shadow-sm shadow-brand-900/20 transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? <><Loader2 size={16} className="animate-spin" /> Creating invoice…</> : <><Plus size={16} /> Create invoice{ready ? ` · ${currency(breakup.totalAmount)}` : ""}</>}
              </button>
            ) : null}
            {!ready && !pending ? <p className="text-center text-xs text-slate-500">{missing[0]} to continue.</p> : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
