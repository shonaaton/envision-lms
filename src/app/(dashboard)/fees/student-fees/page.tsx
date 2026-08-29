import { dbConnect } from "@/lib/db";
import { createInvoice, ensureMonthlyInvoices } from "@/lib/fees";
import { formatINR } from "@/lib/utils";
import { CreditLedger, FeeAssignment, FeePlan, Invoice } from "@/models/Fee";
import { User } from "@/models/User";
import { revalidatePath } from "next/cache";
import { History, Receipt, UserPlus, Users, WalletCards } from "lucide-react";
import { LegacyStudentImportForm, StudentFeeAssignmentForm } from "@/components/fees/StudentFeeForms";
import { Types } from "mongoose";
import { redirect } from "next/navigation";
import { requireFeesAccess } from "@/lib/feesAccess";
import { recordActivity } from "@/lib/activity";
import { importLegacyStudentData } from "@/lib/legacyStudentImport";

export const dynamic = "force-dynamic";

type ViewKey = "assign" | "records" | "history" | "import";

function selectedView(value?: string): ViewKey {
  if (value === "assign" || value === "history" || value === "import") return value;
  return "records";
}

function toolHref(view: ViewKey) {
  return `/fees/student-fees?view=${view}`;
}

function ToolCard({ href, active, label, count, icon, tone }: { href: string; active: boolean; label: string; count?: string | number; icon: React.ReactNode; tone: string }) {
  return (
    <a href={href} className={`flex min-h-[76px] items-center gap-3 rounded-lg border bg-white px-3 py-3 shadow-sm transition hover:border-brand/25 hover:bg-slate-50 ${active ? "border-brand/35 ring-2 ring-brand/10" : "border-slate-200"}`}>
      <span className={`grid h-9 w-9 flex-none place-items-center rounded-md ${tone}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-slate-950">{label}</span>
        {count !== undefined && <span className="mt-0.5 block text-xs font-semibold text-slate-500">{count}</span>}
      </span>
    </a>
  );
}

function SectionTitle({ title, note, action }: { title: string; note?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-base font-bold text-slate-950">{title}</h2>
        {note && <p className="mt-1 text-xs leading-5 text-slate-500">{note}</p>}
      </div>
      {action}
    </div>
  );
}

async function assignPlan(formData: FormData) {
  "use server";
  const session = await requireFeesAccess("edit", "studentFees");
  if (!session) throw new Error("Forbidden");
  await dbConnect();
  try {
    const student = String(formData.get("student") || "");
    const planId = String(formData.get("plan") || "");
    const rawStartDate = String(formData.get("billingStartDate") || "");
    const rawDueDate = String(formData.get("firstDueDate") || rawStartDate);
    if (!Types.ObjectId.isValid(student) || !Types.ObjectId.isValid(planId)) {
      redirect("/fees/student-fees?error=invalid-selection");
    }
    const billingStartDate = rawStartDate ? new Date(rawStartDate) : new Date();
    if (Number.isNaN(billingStartDate.getTime())) {
      redirect("/fees/student-fees?error=invalid-date");
    }
    const firstDueDate = rawDueDate ? new Date(rawDueDate) : billingStartDate;
    if (Number.isNaN(firstDueDate.getTime())) {
      redirect("/fees/student-fees?error=invalid-date");
    }
    firstDueDate.setHours(23, 59, 59, 999);
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
          firstDueDate,
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
          dueDate: firstDueDate,
          credits: Number(plan.credits || 0),
          notes: "Generated when credit plan was assigned",
          invoiceMode: plan.gstMode || "non_gst",
          gstPercentage: Number(plan.gstPercentage || 0),
          activity: {
            actor: (session.user as any).id,
            source: "plan_assignment",
            label: `Generated credit invoice after assigning ${plan.name}`,
          },
        });
      }
    } else {
      const existingMonthlyInvoice = await Invoice.exists({
        student: new Types.ObjectId(student),
        assignment: assignment._id,
        type: "monthly",
        dueDate: firstDueDate,
        status: { $ne: "cancelled" },
      });
      if (!existingMonthlyInvoice) {
        await createInvoice({
          student,
          plan: plan._id.toString(),
          assignment: assignment._id.toString(),
          type: "monthly",
          title: `${plan.name} - ${firstDueDate.toLocaleString("en-IN", { month: "long", year: "numeric" })}`,
          amount: Number(plan.amount || 0),
          dueDate: firstDueDate,
          notes: "Generated when monthly plan was assigned",
          invoiceMode: plan.gstMode || "non_gst",
          gstPercentage: Number(plan.gstPercentage || 0),
          activity: {
            actor: (session.user as any).id,
            source: "plan_assignment",
            label: `Generated monthly invoice after assigning ${plan.name}`,
          },
        });
      }
      await ensureMonthlyInvoices();
    }
    await recordActivity({
      actor: (session.user as any).id,
      targetUser: student,
      type: existing ? "fees.assignment.updated" : "fees.assignment.created",
      label: `${existing ? "Changed" : "Assigned"} fee plan ${plan.name} for ${studentDoc.name}`,
      entityType: "FeeAssignment",
      entityId: assignment._id.toString(),
      metadata: {
        student,
        studentName: studentDoc.name,
        plan: plan._id.toString(),
        planName: plan.name,
        planType: plan.type,
        billingStartDate,
        firstDueDate,
        note,
        source: "manual_admin",
      },
    });
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
  const session = await requireFeesAccess("edit", "studentFees");
  if (!session) throw new Error("Forbidden");
  await dbConnect();
  const assignmentId = String(formData.get("assignment") || "");
  if (!Types.ObjectId.isValid(assignmentId)) redirect("/fees/student-fees?error=invalid-selection");

  const assignment: any = await FeeAssignment.findById(assignmentId).populate("student plan").lean();
  if (!assignment) redirect("/fees/student-fees?error=missing-record");

  await Promise.all([
    CreditLedger.deleteMany({ assignment: assignment._id }),
    Invoice.deleteMany({ assignment: assignment._id }),
    FeeAssignment.findByIdAndDelete(assignment._id),
  ]);
  await recordActivity({
    actor: (session.user as any).id,
    targetUser: assignment.student?._id?.toString?.() || assignment.student?.toString?.() || "",
    type: "fees.assignment.deleted",
    label: `Deleted fee record for ${assignment.student?.name || "student"}`,
    entityType: "FeeAssignment",
    entityId: assignment._id.toString(),
    metadata: {
      planName: assignment.plan?.name || "",
      planType: assignment.type,
      creditBalance: assignment.creditBalance || 0,
      source: "manual_admin",
    },
  });

  revalidatePath("/fees/student-fees");
  revalidatePath("/fees/invoices");
  revalidatePath("/fees/credit-monitoring");
  revalidatePath("/fees");
  redirect("/fees/student-fees?success=deleted");
}

async function importLegacyRecords(formData: FormData) {
  "use server";
  const session = await requireFeesAccess("edit", "studentFees");
  if (!session) throw new Error("Forbidden");
  await dbConnect();

  try {
    const studentId = String(formData.get("student") || "");
    const planId = String(formData.get("plan") || "");
    const file = formData.get("file");

    if (!Types.ObjectId.isValid(studentId)) redirect("/fees/student-fees?view=import&error=invalid-selection");
    if (planId && !Types.ObjectId.isValid(planId)) redirect("/fees/student-fees?view=import&error=invalid-selection");
    if (!(file instanceof File) || file.size === 0) redirect("/fees/student-fees?view=import&error=missing-file");

    const result = await importLegacyStudentData({
      studentId,
      planId: planId || undefined,
      actorId: (session.user as any).id,
      fileName: file.name || "legacy-import.csv",
      fileBuffer: Buffer.from(await file.arrayBuffer()),
    });

    revalidatePath("/fees/student-fees");
    revalidatePath("/fees");
    revalidatePath("/fees/invoices");
    revalidatePath("/attendance");
    redirect(
      `/fees/student-fees?view=import&success=imported&attendance=${result.attendanceImported}&invoices=${result.invoicesImported}&summaries=${result.summariesApplied}`
    );
  } catch (error: any) {
    if (String(error?.digest || "").startsWith("NEXT_REDIRECT")) throw error;
    console.error("Legacy import failed", error);
    redirect(`/fees/student-fees?view=import&error=${encodeURIComponent(error?.message || "legacy-import-failed")}`);
  }
}

export default async function StudentFeesPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await requireFeesAccess("view", "studentFees"))) return <div className="p-6">Forbidden</div>;
  await dbConnect();
  await ensureMonthlyInvoices();
  const params = searchParams ? await searchParams : {};
  const error = typeof params.error === "string" ? params.error : "";
  const success = typeof params.success === "string" ? params.success : "";
  const attendanceImported = typeof params.attendance === "string" ? Number(params.attendance) || 0 : 0;
  const invoicesImported = typeof params.invoices === "string" ? Number(params.invoices) || 0 : 0;
  const summariesApplied = typeof params.summaries === "string" ? Number(params.summaries) || 0 : 0;
  const decodedError = error ? decodeURIComponent(error) : "";
  const view = selectedView(typeof params.view === "string" ? params.view : "");
  const [students, plans, assignments, invoices, credits] = await Promise.all([
    User.find({ role: "student", isActive: { $ne: false } }, { passwordHash: 0 }).sort({ name: 1 }).lean(),
    FeePlan.find({ isActive: true }).sort({ name: 1 }).lean(),
    FeeAssignment.find({}).populate("student plan").sort({ updatedAt: -1 }).lean(),
    Invoice.find({}).populate("student plan").sort({ createdAt: -1 }).limit(2000).lean(),
    CreditLedger.find({}).populate("student").sort({ createdAt: -1 }).limit(100).lean(),
  ]);
  const creditAssignments = assignments.filter((assignment: any) => assignment.type === "credits");
  const monthlyAssignments = assignments.filter((assignment: any) => assignment.type === "monthly");
  const now = new Date();
  const outstandingRecords = assignments.filter((assignment: any) => {
    const studentInvoices = invoices.filter((invoice: any) => invoice.student?._id?.toString() === assignment.student?._id?.toString());
    return studentInvoices.some((invoice: any) => {
      if (invoice.status === "paid" || invoice.status === "cancelled") return false;
      return new Date(invoice.dueDate).getTime() <= now.getTime();
    });
  });
  const upcomingRecords = assignments.filter((assignment: any) => {
    const studentInvoices = invoices.filter((invoice: any) => invoice.student?._id?.toString() === assignment.student?._id?.toString());
    const hasOutstanding = studentInvoices.some((invoice: any) => {
      if (invoice.status === "paid" || invoice.status === "cancelled") return false;
      return new Date(invoice.dueDate).getTime() <= now.getTime();
    });
    if (hasOutstanding) return false;
    return studentInvoices.some((invoice: any) => {
      if (invoice.status === "paid" || invoice.status === "cancelled") return false;
      return new Date(invoice.dueDate).getTime() > now.getTime();
    });
  });

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-purple-50 text-purple-700"><Users size={17} /></span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand/70">Fees</p>
            <h1 className="text-xl font-bold text-slate-950">Student Fees</h1>
          </div>
        </div>
      </div>

      {(success === "assigned" || success === "deleted" || success === "imported") && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {success === "deleted"
            ? "Fee record deleted successfully."
            : success === "imported"
              ? `Legacy data imported successfully. Attendance rows: ${attendanceImported}, invoice rows: ${invoicesImported}, summaries applied: ${summariesApplied}.`
              : "Fee plan assigned successfully."}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {error === "invalid-selection"
            ? "Please select a valid student and fee plan."
            : error === "invalid-date"
              ? "Please choose a valid effective date."
              : error === "missing-file"
                ? "Please upload the CSV file for this student."
              : error === "missing-record"
                ? "The selected student or fee plan no longer exists."
                : error === "legacy-import-failed"
                  ? "Legacy import could not be completed. Please check the file and try again."
                  : decodedError || "Fee plan could not be assigned. Please check the selected plan and try again."}
        </div>
      )}

      <nav className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <ToolCard href={toolHref("assign")} active={view === "assign"} label="Assign Plan" count={`${students.length} students`} icon={<UserPlus size={17} />} tone="bg-emerald-50 text-emerald-700" />
        <ToolCard href={toolHref("records")} active={view === "records"} label="Student Records" count={`${assignments.length} assigned`} icon={<Receipt size={17} />} tone="bg-purple-50 text-purple-700" />
        <ToolCard href={toolHref("history")} active={view === "history"} label="Credit History" count={`${credits.length} recent`} icon={<WalletCards size={17} />} tone="bg-slate-100 text-slate-700" />
        <ToolCard href={toolHref("import")} active={view === "import"} label="Legacy Import" count="Attendance + fees" icon={<History size={17} />} tone="bg-amber-50 text-amber-700" />
      </nav>

      {view === "assign" && (
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <SectionTitle title="Assign / Change Fee Structure" note={`${plans.length} active plans available.`} />
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
              gstMode: plan.gstMode || "non_gst",
            }))}
          />
        </section>
      )}

      {view === "records" && (
        <>
          <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <ToolCard href="/fees/student-fees?view=records" active={false} label="Credit Plans" count={creditAssignments.length} icon={<WalletCards size={17} />} tone="bg-emerald-50 text-emerald-700" />
            <ToolCard href="/fees/student-fees?view=records" active={false} label="Monthly Plans" count={monthlyAssignments.length} icon={<Receipt size={17} />} tone="bg-purple-50 text-purple-700" />
            <ToolCard href="/fees/student-fees?view=records" active={false} label="Outstanding" count={outstandingRecords.length} icon={<History size={17} />} tone="bg-amber-50 text-amber-700" />
            <ToolCard href="/fees/student-fees?view=records" active={false} label="Upcoming" count={upcomingRecords.length} icon={<History size={17} />} tone="bg-sky-50 text-sky-700" />
          </div>
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <SectionTitle title="Student Fee Records" note="Student names open their invoice list." />
            {assignments.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6">
                <h3 className="text-sm font-bold text-slate-950">No fee records found</h3>
                <p className="mt-1 text-xs text-slate-500">Assign a plan to create the first record.</p>
              </div>
            ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500"><tr><th className="px-3 py-3">Student</th><th className="px-3 py-3">Plan</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Outstanding</th><th className="px-3 py-3">Upcoming</th><th className="px-3 py-3">Late Fee</th><th className="px-3 py-3">Credits</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Last Paid</th><th className="px-3 py-3">Actions</th></tr></thead>
                <tbody>
                  {assignments.map((a: any) => {
                    const studentInvoices = invoices.filter((i: any) => i.student?._id?.toString() === a.student?._id?.toString());
                    const unpaidInvoices = studentInvoices.filter((i: any) => i.status !== "paid" && i.status !== "cancelled");
                    const outstandingInvoices = unpaidInvoices.filter((i: any) => new Date(i.dueDate).getTime() <= now.getTime());
                    const upcomingInvoices = unpaidInvoices.filter((i: any) => new Date(i.dueDate).getTime() > now.getTime());
                    const outstanding = outstandingInvoices.reduce((sum: number, i: any) => sum + i.totalAmount, 0);
                    const upcoming = upcomingInvoices.reduce((sum: number, i: any) => sum + i.totalAmount, 0);
                    const lateFees = outstandingInvoices.reduce((sum: number, i: any) => sum + (i.lateFee || 0), 0);
                    const lastPaid = studentInvoices.filter((i: any) => i.status === "paid" && i.paidAt).sort((x: any, y: any) => new Date(y.paidAt).getTime() - new Date(x.paidAt).getTime())[0];
                    const studentId = a.student?._id?.toString?.() || "";
                    return (
                      <tr key={a._id} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="px-3 py-3">
                          <a className="font-semibold text-brand hover:underline" href={studentId ? `/fees/invoices?student=${studentId}` : "#"}>{a.student?.name || "Student"}</a>
                          <div className="text-xs text-slate-500">{a.student?.username || studentId || "-"}</div>
                        </td>
                        <td className="px-3 py-3">{a.plan?.name}</td>
                        <td className="px-3 py-3">{a.type === "credits" ? "Credit" : "Monthly"}</td>
                        <td className="px-3 py-3 font-semibold">{formatINR(outstanding)}</td>
                        <td className="px-3 py-3 font-semibold text-sky-700">{formatINR(upcoming)}</td>
                        <td className="px-3 py-3">{formatINR(lateFees)}</td>
                        <td className="px-3 py-3">{a.type === "credits" ? `${a.creditBalance} left` : "-"}</td>
                        <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${outstanding > 0 ? "bg-amber-50 text-amber-700" : upcoming > 0 ? "bg-sky-50 text-sky-700" : "bg-emerald-50 text-emerald-700"}`}>{outstanding > 0 ? "Outstanding" : upcoming > 0 ? "Upcoming" : "Clear"}</span></td>
                        <td className="px-3 py-3 text-xs text-slate-500">{lastPaid ? new Date(lastPaid.paidAt).toLocaleDateString("en-IN") : "-"}</td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <a className="rounded-md border border-purple-200 px-3 py-1.5 text-xs font-semibold text-purple-700" href={`/fees/invoices?student=${studentId}`}>Invoices</a>
                            <form action={deleteFeeAssignment}>
                              <input type="hidden" name="assignment" value={a._id.toString()} />
                              <button className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700">Delete</button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
          </section>
        </>
      )}

      {view === "history" && (
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <SectionTitle title="Recent Credit / Recharge History" note="Recharge and adjustment entries." />
          {credits.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6">
              <h3 className="text-sm font-bold text-slate-950">No recharge history found</h3>
              <p className="mt-1 text-xs text-slate-500">Recharge transactions will appear here once students purchase or renew credit plans.</p>
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500"><tr><th className="px-3 py-3">Student</th><th className="px-3 py-3">Reason</th><th className="px-3 py-3">Credits</th><th className="px-3 py-3">Date</th></tr></thead>
              <tbody>
                {credits.map((c: any) => (
                  <tr key={c._id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-3 py-3 font-semibold text-slate-950">{c.student?.name || "Student"}</td>
                    <td className="px-3 py-3 text-xs text-slate-600">{c.note || c.type}</td>
                    <td className={`px-3 py-3 font-bold ${c.credits > 0 ? "text-emerald-700" : "text-rose-700"}`}>{c.credits > 0 ? "+" : ""}{c.credits}</td>
                    <td className="px-3 py-3 text-xs text-slate-500">{new Date(c.createdAt).toLocaleDateString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </section>
      )}

      {view === "import" && (
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <SectionTitle title="Import Legacy Attendance & Fees" note="Select a student and upload a CSV, XLSX, PDF statement, or ZIP statement. Attendance can be imported without classroom PGN data. Historical payment files can create invoice history directly." />
          <LegacyStudentImportForm
            action={importLegacyRecords}
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
      )}
    </div>
  );
}
