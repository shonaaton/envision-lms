import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { createInvoice, ensureMonthlyInvoices } from "@/lib/fees";
import { formatINR } from "@/lib/utils";
import { CreditLedger, FeeAssignment, FeePlan, Invoice } from "@/models/Fee";
import { User } from "@/models/User";
import { revalidatePath } from "next/cache";
import { History, Users } from "lucide-react";
import { StudentFeeAssignmentForm } from "@/components/fees/StudentFeeForms";
import { Types } from "mongoose";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function assignPlan(formData: FormData) {
  "use server";
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") throw new Error("Forbidden");
  await dbConnect();
  try {
    const student = String(formData.get("student") || "");
    const planId = String(formData.get("plan") || "");
    const rawStartDate = String(formData.get("billingStartDate") || "");
    if (!Types.ObjectId.isValid(student) || !Types.ObjectId.isValid(planId)) {
      redirect("/fees/student-fees?error=invalid-selection");
    }
    const billingStartDate = rawStartDate ? new Date(rawStartDate) : new Date();
    if (Number.isNaN(billingStartDate.getTime())) {
      redirect("/fees/student-fees?error=invalid-date");
    }
    const [plan, studentDoc]: any[] = await Promise.all([
      FeePlan.findById(planId),
      User.findOne({ _id: student, role: "student" }).lean(),
    ]);
    if (!plan || !studentDoc) {
      redirect("/fees/student-fees?error=missing-record");
    }

    const note = String(formData.get("note") || "Plan assigned");
    const historyEntry = `${new Date().toISOString()} | ${plan.name} | ${plan.type} | ${note}`;

    const existing: any = await FeeAssignment.findOne({ student });
    const assignment: any = await FeeAssignment.findOneAndUpdate(
      { student },
      {
        $set: {
          student: new Types.ObjectId(student),
          plan: plan._id,
          type: plan.type,
          billingStartDate,
          creditBalance: existing?.creditBalance ?? 0,
          totalCreditsPurchased: existing?.totalCreditsPurchased ?? 0,
          totalCreditsConsumed: existing?.totalCreditsConsumed ?? 0,
        },
        $push: {
          history: historyEntry,
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
    if (plan.type === "credits") {
      const existingCreditInvoice = await Invoice.exists({
        student: new Types.ObjectId(student),
        plan: plan._id,
        assignment: assignment._id,
        type: "credits",
        status: { $ne: "cancelled" },
      });
      if (!existingCreditInvoice) {
        await createInvoice({
          student,
          plan: plan._id.toString(),
          assignment: assignment._id.toString(),
          type: "credits",
          title: `${plan.name} credit recharge`,
          amount: Number(plan.amount || 0),
          dueDate: billingStartDate,
          credits: Number(plan.credits || 0),
          notes: "Generated when credit plan was assigned",
          invoiceMode: plan.gstMode || "non_gst",
          gstPercentage: Number(plan.gstPercentage || 0),
        });
      }
    } else {
      await ensureMonthlyInvoices();
    }
    revalidatePath("/fees/student-fees");
    revalidatePath("/fees");
    revalidatePath("/fees/invoices");
  } catch (error: any) {
    if (String(error?.digest || "").startsWith("NEXT_REDIRECT")) throw error;
    console.error("Fee plan assignment failed", error);
    redirect("/fees/student-fees?error=assignment-failed");
  }
  redirect("/fees/student-fees?success=assigned");
}

async function deleteFeeAssignment(formData: FormData) {
  "use server";
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") throw new Error("Forbidden");
  await dbConnect();
  const assignmentId = String(formData.get("assignment") || "");
  if (!Types.ObjectId.isValid(assignmentId)) redirect("/fees/student-fees?error=invalid-selection");

  const assignment: any = await FeeAssignment.findById(assignmentId).lean();
  if (!assignment) redirect("/fees/student-fees?error=missing-record");

  await Promise.all([
    CreditLedger.deleteMany({ assignment: assignment._id }),
    Invoice.deleteMany({ assignment: assignment._id }),
    FeeAssignment.findByIdAndDelete(assignment._id),
  ]);

  revalidatePath("/fees/student-fees");
  revalidatePath("/fees/invoices");
  revalidatePath("/fees/credit-monitoring");
  revalidatePath("/fees");
  redirect("/fees/student-fees?success=deleted");
}

export default async function StudentFeesPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return <div className="p-6">Forbidden</div>;
  await dbConnect();
  await ensureMonthlyInvoices();
  const params = searchParams ? await searchParams : {};
  const error = typeof params.error === "string" ? params.error : "";
  const success = typeof params.success === "string" ? params.success : "";
  const [students, plans, assignments, invoices, credits] = await Promise.all([
    User.find({ role: "student" }, { passwordHash: 0 }).sort({ name: 1 }).lean(),
    FeePlan.find({ isActive: true }).sort({ name: 1 }).lean(),
    FeeAssignment.find({}).populate("student plan").sort({ updatedAt: -1 }).lean(),
    Invoice.find({}).populate("student plan").sort({ createdAt: -1 }).limit(200).lean(),
    CreditLedger.find({}).populate("student").sort({ createdAt: -1 }).limit(100).lean(),
  ]);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="mb-5 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-purple-50 text-purple-700"><Users size={18} /></span>
        <div><h1 className="text-2xl font-semibold">Student Fees</h1><p className="text-sm text-slate-500">Assign plans, track outstanding amounts, credit history, recharge history, and late fees.</p></div>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 font-semibold">Assign / Change Fee Structure</h2>
        {success === "assigned" || success === "deleted" ? (
          <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            {success === "deleted" ? "Fee record deleted successfully." : "Fee plan assigned successfully."}
          </div>
        ) : null}
        {error ? (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
            {error === "invalid-selection"
              ? "Please select a valid student and fee plan."
              : error === "invalid-date"
                ? "Please choose a valid effective date."
                : error === "missing-record"
                  ? "The selected student or fee plan no longer exists."
                  : "Fee plan could not be assigned. Please check the selected plan and try again."}
          </div>
        ) : null}
        <StudentFeeAssignmentForm
          action={assignPlan}
          students={students.map((student: any) => ({
            id: student._id.toString(),
            name: student.name,
            username: student.username,
            hasAssignment: assignments.some((assignment: any) => assignment.student?._id?.toString() === student._id.toString()),
          }))}
          plans={plans.map((plan: any) => ({
            id: plan._id.toString(),
            name: plan.name,
            type: plan.type,
            amount: plan.amount,
            credits: plan.credits || 0,
          }))}
        />
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 font-semibold">Student Fee Records</h2>
        {assignments.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6">
            <h3 className="font-semibold text-slate-950">No Fee Records Found</h3>
            <p className="mt-1 text-sm text-slate-500">No students have been assigned a fee structure yet. Click Assign Plan above to assign a Monthly or Credit-Based Plan to a student.</p>
          </div>
        ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500"><tr className="border-b"><th className="px-3 py-3">Student Name</th><th>Student ID</th><th>Assigned Plan</th><th>Plan Type</th><th>Outstanding Amount</th><th>Late Fees Due</th><th>Remaining Credits</th><th>Payment Status</th><th>Last Payment Date</th><th>Actions</th><th>History</th></tr></thead>
            <tbody>
              {assignments.map((a: any) => {
                const studentInvoices = invoices.filter((i: any) => i.student?._id?.toString() === a.student?._id?.toString());
                const outstanding = studentInvoices.filter((i: any) => i.status !== "paid").reduce((sum: number, i: any) => sum + i.totalAmount, 0);
                const lateFees = studentInvoices.reduce((sum: number, i: any) => sum + (i.lateFee || 0), 0);
                const lastPaid = studentInvoices.filter((i: any) => i.status === "paid" && i.paidAt).sort((x: any, y: any) => new Date(y.paidAt).getTime() - new Date(x.paidAt).getTime())[0];
                return (
                  <tr key={a._id} className="border-b last:border-0">
                    <td className="px-3 py-3 font-medium">{a.student?.name}</td>
                    <td>{a.student?.username || a.student?._id?.toString?.() || "-"}</td>
                    <td>{a.plan?.name}</td>
                    <td>{a.type === "credits" ? "Credit-Based" : "Monthly"}</td>
                    <td>{formatINR(outstanding)}</td>
                    <td>{formatINR(lateFees)}</td>
                    <td>{a.type === "credits" ? `${a.creditBalance} left (${a.totalCreditsConsumed} used)` : "-"}</td>
                    <td>{outstanding > 0 ? "Outstanding" : "Clear"}</td>
                    <td>{lastPaid ? new Date(lastPaid.paidAt).toLocaleDateString("en-IN") : "-"}</td>
                    <td>
                      <div className="flex flex-wrap items-center gap-2">
                        <a className="rounded-md border border-purple-200 px-3 py-1.5 text-xs font-semibold text-purple-700" href={`/fees/invoices?student=${a.student?._id}`}>View Invoices</a>
                        <form action={deleteFeeAssignment}>
                          <input type="hidden" name="assignment" value={a._id.toString()} />
                          <button className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700">Delete Record</button>
                        </form>
                      </div>
                    </td>
                    <td><span className="inline-flex items-center gap-1 text-xs text-slate-500"><History size={13} /> {a.history?.length || 0} changes</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 font-semibold">Recent Credit / Recharge History</h2>
        {credits.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6">
            <h3 className="font-semibold text-slate-950">No Recharge History Found</h3>
            <p className="mt-1 text-sm text-slate-500">Recharge transactions will appear here once students purchase or renew credit plans.</p>
          </div>
        ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {credits.map((c: any) => (
            <div key={c._id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
              <span>{c.student?.name} - {c.note || c.type}</span>
              <b className={c.credits > 0 ? "text-emerald-700" : "text-rose-700"}>{c.credits > 0 ? "+" : ""}{c.credits}</b>
            </div>
          ))}
        </div>
        )}
      </section>
    </div>
  );
}
