"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";

type InvoiceType = "monthly" | "credits" | "manual";
type TaxMode = "included" | "excluded" | "non_gst";
type StudentOption = { id: string; name: string };
type PlanOption = { id: string; name: string; type: "monthly" | "credits"; amount: number; credits: number; gstMode?: TaxMode; gstPercentage?: number };
type AssignmentOption = { studentId: string; planId: string };
type ServerAction = (formData: FormData) => Promise<void>;

function Field({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5">
      <span className="block text-sm font-semibold text-slate-800">{label}</span>
      {children}
      <span className="block text-xs leading-5 text-slate-500">{description}</span>
    </label>
  );
}

function currency(paise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
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
  const [studentId, setStudentId] = useState("");
  const [invoiceType, setInvoiceType] = useState<InvoiceType | "">("");
  const [planId, setPlanId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [invoiceMode, setInvoiceMode] = useState<TaxMode>("non_gst");

  const selectedStudent = students.find((student) => student.id === studentId);
  const availablePlanIds = assignments.filter((assignment) => assignment.studentId === studentId).map((assignment) => assignment.planId);
  const availablePlans = plans.filter((plan) => {
    if (!studentId || !invoiceType) return false;
    if (invoiceType === "manual") return availablePlanIds.includes(plan.id);
    return availablePlanIds.includes(plan.id) && plan.type === invoiceType;
  });
  const selectedPlan = plans.find((plan) => plan.id === planId);
  const defaultTitle = useMemo(() => {
    if (!selectedStudent || !selectedPlan) return "";
    const month = new Date(invoiceDate || today).toLocaleString("en-IN", { month: "long", year: "numeric" });
    return `${selectedStudent.name} - ${selectedPlan.name} - ${month}`;
  }, [selectedStudent, selectedPlan, invoiceDate, today]);
  const planDisabled = !studentId || !invoiceType;

  useEffect(() => {
    setTitle(defaultTitle);
    setAmount(selectedPlan ? String(selectedPlan.amount / 100) : "");
    setInvoiceMode((selectedPlan?.gstMode as TaxMode) || "non_gst");
  }, [defaultTitle, selectedPlan]);

  return (
    <form action={action} className="space-y-5">
      <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
        <b>Guided workflow:</b> Step 1 Select Student, Step 2 Select Invoice Type, Step 3 Select Plan, Step 4 Review Details, Step 5 Generate Invoice.
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Student" description="Choose the student for whom the invoice is being generated.">
          <select name="student" required value={studentId} onChange={(event) => { setStudentId(event.target.value); setPlanId(""); }} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
            <option value="">Select Student</option>
            {students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
          </select>
        </Field>

        <Field label="Invoice Type" description="Manual invoices are mainly for cash payments, bank transfers, offline payments, adjustments, or exceptional billing.">
          <select name="type" required value={invoiceType} onChange={(event) => { setInvoiceType(event.target.value as InvoiceType); setPlanId(""); }} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
            <option value="">Select Invoice Type</option>
            <option value="monthly">Monthly Plan Invoice</option>
            <option value="credits">Credit Plan Invoice</option>
            <option value="manual">Custom Invoice</option>
          </select>
        </Field>

        <Field label="Plan" description="Select an assigned plan after choosing both Student and Invoice Type.">
          <select name="plan" required value={planId} onChange={(event) => setPlanId(event.target.value)} disabled={planDisabled} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-100 disabled:text-slate-400">
            <option value="">{planDisabled ? "Select student and invoice type first" : "Select Assigned Plan"}</option>
            {availablePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
          </select>
        </Field>

        <Field label="Invoice Date" description="The date on which the invoice is being generated. Defaults to today.">
          <input name="invoiceDate" type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" />
        </Field>

        <Field label="Due Date" description="Select the date by which payment should be completed.">
          <input name="dueDate" type="date" required defaultValue={today} className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" />
        </Field>

        <Field label="Invoice Amount" description="Auto-filled from the plan. Administrators may override it when necessary.">
          <input name="amount" type="number" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Auto-filled from Plan" className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" />
        </Field>

        <Field label="Invoice Tax Mode" description="Choose whether GST is included, added separately, or not applicable.">
          <select name="invoiceMode" value={invoiceMode} onChange={(event) => setInvoiceMode(event.target.value as TaxMode)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
            <option value="included">GST Included</option>
            <option value="excluded">GST Excluded</option>
            <option value="non_gst">Non-GST Invoice</option>
          </select>
        </Field>

        <Field label="GST Percentage" description="Used only when the invoice is GST-enabled.">
          <input name="gstPercentage" type="number" min="0" defaultValue={selectedPlan?.gstPercentage || 18} className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" />
        </Field>

        <Field label="Invoice Title" description="Auto-generated from Student Name and Plan, but editable if required.">
          <input name="title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Auto-generated from Student Name and Plan" className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm xl:col-span-2" />
        </Field>

        <Field label="Internal Notes (Optional)" description="Visible only to administrators.">
          <input name="notes" placeholder="Enter remarks regarding this invoice" className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" />
        </Field>
      </div>

      <div className="rounded-lg border border-purple-100 bg-purple-50 p-4">
        <h3 className="font-semibold text-purple-950">Invoice Preview</h3>
        <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-purple-950 md:grid-cols-2 xl:grid-cols-4">
          <div><span className="text-purple-700">Student:</span> {selectedStudent?.name || "Select Student"}</div>
          <div><span className="text-purple-700">Plan:</span> {selectedPlan?.name || "Select Plan"}</div>
          <div><span className="text-purple-700">Invoice Number:</span> Auto-assigned</div>
          <div><span className="text-purple-700">Invoice Date:</span> {invoiceDate}</div>
          <div><span className="text-purple-700">Amount Before Tax:</span> {selectedPlan ? currency(selectedPlan.amount) : "Auto-filled"}</div>
          <div><span className="text-purple-700">GST Details:</span> {invoiceMode === "non_gst" ? "No GST" : `${invoiceMode === "included" ? "Included" : "Added separately"} @ ${selectedPlan?.gstPercentage || 18}%`}</div>
          <div><span className="text-purple-700">Total Amount:</span> {selectedPlan ? currency(selectedPlan.amount) : "Auto-calculated"}</div>
          <div><span className="text-purple-700">Signatory:</span> From Academy Setup</div>
        </div>
      </div>

      <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-purple-700 px-4 text-sm font-semibold text-white hover:bg-purple-800">
        <Plus size={15} /> Generate Invoice
      </button>
    </form>
  );
}
