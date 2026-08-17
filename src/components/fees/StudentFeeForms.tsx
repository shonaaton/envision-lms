"use client";

import { useMemo, useState } from "react";
import { UserPlus } from "lucide-react";

type StudentOption = { id: string; name: string; username?: string; hasAssignment: boolean };
type PlanOption = { id: string; name: string; type: "monthly" | "credits"; amount: number; credits: number };
type ServerAction = (formData: FormData) => Promise<void>;

function Field({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="block text-xs font-bold uppercase tracking-[0.1em] text-slate-500">{label}</span>
      {children}
      <span className="block text-xs leading-5 text-slate-500">{description}</span>
    </label>
  );
}

export function StudentFeeAssignmentForm({ students, plans, action }: { students: StudentOption[]; plans: PlanOption[]; action: ServerAction }) {
  const [studentId, setStudentId] = useState("");
  const [planId, setPlanId] = useState("");
  const selectedStudent = useMemo(() => students.find((student) => student.id === studentId), [students, studentId]);
  const selectedPlan = useMemo(() => plans.find((plan) => plan.id === planId), [plans, planId]);
  const buttonText = selectedStudent?.hasAssignment ? "Update Plan" : "Assign Plan";

  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Student" description="Student to update.">
          <select name="student" required value={studentId} onChange={(event) => setStudentId(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
            <option value="">Select Student</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>{student.name}{student.username ? ` (${student.username})` : ""}</option>
            ))}
          </select>
        </Field>

        <Field label="Fee Plan" description="Monthly or credit plan.">
          <select name="plan" required value={planId} onChange={(event) => setPlanId(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
            <option value="">Select Fee Plan</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} - {plan.type === "monthly" ? "Monthly Plan" : `${plan.credits} Credit Plan`}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Effective Date" description="Plan start date.">
          <input name="billingStartDate" type="date" required className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" />
        </Field>

        <Field label={selectedPlan?.type === "monthly" ? "First Due Date" : "Invoice Due Date"} description={selectedPlan?.type === "monthly" ? "The monthly invoice will use this due date." : "Payment due date for the credit invoice."}>
          <input name="firstDueDate" type="date" required className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Reason (Optional)" description="Internal note.">
          <input name="note" placeholder="Example: Shifted from Monthly Plan to Credit Plan" className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" />
        </Field>
      </div>

      <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-purple-700 px-4 text-sm font-semibold text-white hover:bg-purple-800">
        <UserPlus size={15} /> {buttonText}
      </button>
    </form>
  );
}

const LEGACY_IMPORT_TEMPLATE = `row_type,total_fees_inr,fees_paid_inr,due_amount_inr,concession_amount_inr,installment_number,fee_type,paid_amount_inr,paid_date,amount_inr,balance_amount_inr,due_date,status,event_date,attendance_status,duration_minutes,credit_balance,total_credits_purchased,total_credits_consumed,credits,reference_number,note
monthly_summary,12600,12600,0,0,,,,,,,,,,,,,,,,Imported fee summary
monthly_payment,,,,,1,Tuition Fees,4200,2026-05-17,4200,0,2026-05-17,Paid,,,,,,,,OLD-MAY-001,Installment 1 paid
monthly_payment,,,,,2,Tuition Fees,4200,2026-06-22,4200,0,2026-06-22,Paid,,,,,,,,OLD-JUN-001,Installment 2 paid
monthly_payment,,,,,3,Tuition Fees,4200,2026-07-18,4200,0,2026-07-18,Paid,,,,,,,,OLD-JUL-001,Installment 3 paid
attendance,,,,,,,,,,,,,2026-07-19,present,60,,,,,,Imported attendance
credit_summary,,,,,,,,,,,,,,,,12,20,8,,Opening credit snapshot
credit_payment,,,,,,,,,4500,,,2026-08-01,,,,,,,10,OLD-CR-001,Imported credit recharge`;

export function LegacyStudentImportForm({ students, plans, action }: { students: StudentOption[]; plans: PlanOption[]; action: ServerAction }) {
  const [studentId, setStudentId] = useState("");
  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(LEGACY_IMPORT_TEMPLATE)}`;

  return (
    <form action={action} className="space-y-4" encType="multipart/form-data">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Student" description="Pick the student to migrate.">
          <select name="student" required value={studentId} onChange={(event) => setStudentId(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
            <option value="">Select Student</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>{student.name}{student.username ? ` (${student.username})` : ""}</option>
            ))}
          </select>
        </Field>

        <Field label="Import File" description="Upload a CSV, PDF statement, or ZIP statement for this student.">
          <input name="file" type="file" accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.pdf,application/pdf,.zip,application/zip" required className="block h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold" />
        </Field>

        <div className="flex items-end">
          <a href={templateHref} download="legacy-student-import-template.csv" className="inline-flex h-10 w-full items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100">
            Download Template
          </a>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <p className="font-semibold text-slate-950">Supported row types</p>
        <p className="mt-2">`attendance`: imports class history only.</p>
        <p>`credit_summary`: sets first invoice date, credit left, total credits bought, and total credits used.</p>
        <p>`credit_payment`: creates a paid credit recharge invoice and adds credits.</p>
        <p>`monthly_summary`: maps the fee statement totals like total fees, paid amount, due amount, and concession.</p>
        <p>`monthly_payment`: creates a paid monthly installment from statement rows.</p>
        <p>`monthly_invoice`: creates an unpaid, overdue, cancelled, or paid installment row from the fee structure.</p>
        <p>`xlsx` payment-history uploads create paid invoice history directly from receipt data, without needing a fee plan.</p>
        <p>PDF and ZIP uploads are meant for installment fee statements like the one dated August 17, 2026 that you shared.</p>
        <p>If you prefer the statement style you shared, you can omit `row_type` for installment rows and just use columns like `installment_number`, `fee_type`, `paid_amount_inr`, `paid_date`, `amount_inr`, `balance_amount_inr`, `due_date`, and `status`.</p>
      </div>

      <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800">
        Import Legacy Data
      </button>
    </form>
  );
}
