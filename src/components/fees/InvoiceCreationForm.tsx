"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Plus } from "lucide-react";

type InvoiceType = "monthly" | "credits" | "manual";
type TaxMode = "included" | "excluded" | "non_gst";
type StudentOption = { id: string; name: string };
type PlanOption = { id: string; name: string; type: "monthly" | "credits"; amount: number; credits: number; gstMode?: TaxMode; gstPercentage?: number };
type AssignmentOption = { studentId: string; planId: string };
type ServerAction = (formData: FormData) => Promise<void>;

function currency(paise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5">
      <span className="block text-xs font-bold uppercase tracking-[0.1em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function StepPill({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${active ? "bg-brand text-white" : done ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
      {done ? <CheckCircle2 size={14} /> : null}
      {label}
    </div>
  );
}

export function InvoiceCreationForm({
  students,
  plans,
  assignments,
  action,
}: {
  students: StudentOption[];
  plans: PlanOption[];
  assignments: AssignmentOption[];
  action: ServerAction;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [step, setStep] = useState(1);
  const [studentId, setStudentId] = useState("");
  const [invoiceType, setInvoiceType] = useState<InvoiceType | "">("");
  const [planId, setPlanId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDate, setDueDate] = useState(today);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [invoiceMode, setInvoiceMode] = useState<TaxMode>("non_gst");
  const [gstPercentage, setGstPercentage] = useState("18");

  const selectedStudent = students.find((student) => student.id === studentId);
  const availablePlanIds = assignments.filter((assignment) => assignment.studentId === studentId).map((assignment) => assignment.planId);
  const availablePlans = plans.filter((plan) => {
    if (!studentId || !invoiceType) return false;
    if (invoiceType === "manual") return false;
    return availablePlanIds.includes(plan.id) && plan.type === invoiceType;
  });
  const selectedPlan = plans.find((plan) => plan.id === planId);
  const defaultTitle = useMemo(() => {
    if (!selectedStudent) return "";
    const month = new Date(invoiceDate || today).toLocaleString("en-IN", { month: "long", year: "numeric" });
    if (invoiceType === "manual") return `${selectedStudent.name} - Custom Invoice - ${month}`;
    if (!selectedPlan) return "";
    return `${selectedStudent.name} - ${selectedPlan.name} - ${month}`;
  }, [selectedStudent, selectedPlan, invoiceDate, today, invoiceType]);

  useEffect(() => {
    if (invoiceType === "manual") {
      setPlanId("");
      setTitle((current) => current || defaultTitle);
      setInvoiceMode("non_gst");
      setGstPercentage("18");
      return;
    }
    setTitle(defaultTitle);
    setAmount(selectedPlan ? String(selectedPlan.amount / 100) : "");
    setInvoiceMode((selectedPlan?.gstMode as TaxMode) || "non_gst");
    setGstPercentage(String(selectedPlan?.gstPercentage || 18));
  }, [defaultTitle, selectedPlan, invoiceType]);

  const canContinue =
    (step === 1 && !!studentId) ||
    (step === 2 && !!invoiceType) ||
    (step === 3 && (invoiceType === "manual" || !!planId)) ||
    step === 4;

  function selectStudent(value: string) {
    setStudentId(value);
    setPlanId("");
    setTitle("");
    setAmount("");
  }

  function selectInvoiceType(value: InvoiceType) {
    setInvoiceType(value);
    setPlanId("");
    setTitle("");
    setAmount("");
  }

  function goBack() {
    setStep((value) => (value === 4 && invoiceType === "manual" ? 2 : Math.max(1, value - 1)));
  }

  function goForward() {
    setStep((value) => (value === 2 && invoiceType === "manual" ? 4 : Math.min(4, value + 1)));
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="student" value={studentId} />
      <input type="hidden" name="type" value={invoiceType} />
      <input type="hidden" name="plan" value={planId} />
      <input type="hidden" name="invoiceDate" value={invoiceDate} />
      <input type="hidden" name="dueDate" value={dueDate} />
      <input type="hidden" name="referenceNumber" value={referenceNumber} />
      <input type="hidden" name="amount" value={amount} />
      <input type="hidden" name="invoiceMode" value={invoiceMode} />
      <input type="hidden" name="gstPercentage" value={gstPercentage} />
      <input type="hidden" name="title" value={title} />

      <div className="flex flex-wrap gap-2">
        <StepPill active={step === 1} done={step > 1} label="1 Student" />
        <StepPill active={step === 2} done={step > 2} label="2 Type" />
        <StepPill active={step === 3} done={step > 3 || (invoiceType === "manual" && step === 4)} label={invoiceType === "manual" ? "3 Details" : "3 Plan"} />
        <StepPill active={step === 4} done={false} label="4 Review" />
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        {step === 1 ? (
          <div className="max-w-xl">
            <h3 className="text-base font-bold text-slate-950">Select student</h3>
            <p className="mt-1 text-sm text-slate-500">Choose who this invoice is for.</p>
            <select value={studentId} onChange={(event) => selectStudent(event.target.value)} className="mt-4 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10">
              <option value="">Select Student</option>
              {students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
            </select>
          </div>
        ) : null}

        {step === 2 ? (
          <div>
            <h3 className="text-base font-bold text-slate-950">Select invoice type</h3>
            <p className="mt-1 text-sm text-slate-500">Monthly and credit invoices use assigned plans. Custom invoices let you enter the details directly.</p>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              {[
                ["monthly", "Monthly Plan", "For recurring monthly fees."],
                ["credits", "Credit Plan", "For recharge or credit packs."],
                ["manual", "Custom Invoice", "For adjustments or offline billing."],
              ].map(([value, label, help]) => (
                <button key={value} type="button" onClick={() => selectInvoiceType(value as InvoiceType)} className={`rounded-lg border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${invoiceType === value ? "border-brand bg-white text-brand ring-2 ring-brand/10" : "border-slate-200 bg-white text-slate-950 hover:border-brand/25"}`}>
                  <div className="font-bold">{label}</div>
                  <div className="mt-1 text-xs text-slate-500">{help}</div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {step === 3 && invoiceType !== "manual" ? (
          <div>
            <h3 className="text-base font-bold text-slate-950">Select assigned plan</h3>
            <p className="mt-1 text-sm text-slate-500">Only plans already assigned to the selected student are shown.</p>
            <select value={planId} onChange={(event) => setPlanId(event.target.value)} className="mt-4 h-11 w-full max-w-xl rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10">
              <option value="">{availablePlans.length ? "Select Assigned Plan" : "No matching assigned plan found"}</option>
              {availablePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
            </select>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-slate-950">Review and generate</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Field label="Invoice Date">
                <input type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10" />
              </Field>
              <Field label="Due Date">
                <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10" />
              </Field>
              <Field label="Reference Number">
                <input value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} placeholder="Receipt, transfer, or PO no." className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10" />
              </Field>
              <Field label="Amount">
                <input type="number" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10" />
              </Field>
              <Field label="Tax Mode">
                <select value={invoiceMode} onChange={(event) => setInvoiceMode(event.target.value as TaxMode)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10">
                  <option value="included">GST Included</option>
                  <option value="excluded">GST Excluded</option>
                  <option value="non_gst">Non-GST Invoice</option>
                </select>
              </Field>
              <Field label="GST Percentage">
                <input type="number" min="0" value={gstPercentage} onChange={(event) => setGstPercentage(event.target.value)} disabled={invoiceMode === "non_gst"} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10 disabled:bg-slate-100" />
              </Field>
              <Field label="Invoice Title">
                <input value={title} onChange={(event) => setTitle(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10" />
              </Field>
            </div>
            <input name="notes" placeholder="Internal note, optional" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10" />
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                <div><span className="text-slate-500">Student:</span> <b>{selectedStudent?.name || "-"}</b></div>
                <div><span className="text-slate-500">{invoiceType === "manual" ? "Type:" : "Plan:"}</span> <b>{invoiceType === "manual" ? "Custom Invoice" : selectedPlan?.name || "-"}</b></div>
                <div><span className="text-slate-500">Invoice:</span> Auto-numbered</div>
                <div><span className="text-slate-500">Amount:</span> <b>{amount ? currency(Number(amount) * 100) : "-"}</b></div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap justify-between gap-2">
        <button type="button" disabled={step === 1} onClick={goBack} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-40">
          <ArrowLeft size={15} /> Back
        </button>
        {step < 4 ? (
          <button type="button" disabled={!canContinue} onClick={goForward} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white disabled:opacity-40">
            Continue <ArrowRight size={15} />
          </button>
        ) : (
          <button disabled={!studentId || !invoiceType || (invoiceType !== "manual" && !planId) || !amount || !title} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
            <Plus size={15} /> Generate Invoice
          </button>
        )}
      </div>
    </form>
  );
}
