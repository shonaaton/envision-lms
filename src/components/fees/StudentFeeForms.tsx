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
  const selectedStudent = useMemo(() => students.find((student) => student.id === studentId), [students, studentId]);
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
          <select name="plan" required className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
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
