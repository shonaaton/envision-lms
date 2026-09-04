import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { CreditLedger, FeeAssignment, FeePlan, Notification } from "@/models/Fee";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, Download, Filter, Search, WalletCards, XCircle } from "lucide-react";
import { getFeaturePermissionState } from "@/lib/featureAccess";
import { requireFeesAccess } from "@/lib/feesAccess";
import ManualCreditForm from "@/components/fees/ManualCreditForm";
import { isValidObjectId, Types } from "mongoose";
import { recordActivity } from "@/lib/activity";
import { sendCreditAdjustmentEmail } from "@/lib/studentCommunicationEmails";

export const dynamic = "force-dynamic";

type Params = { q?: string; filter?: string; plan?: string; min?: string; max?: string; view?: string; creditAdjustment?: string; added?: string; student?: string };

function value(params: Params, key: keyof Params) {
  return String(params[key] || "");
}

function exportHref(params: Params, format: "csv" | "xls" | "history") {
  const next = new URLSearchParams({
    q: value(params, "q"),
    filter: value(params, "filter") || "all",
    plan: value(params, "plan"),
    min: value(params, "min"),
    max: value(params, "max"),
    format,
  });
  return `/api/fees/credit-monitoring?${next.toString()}`;
}

function reminderStatusCopy(status?: string) {
  if (status === "sent") return "Reminder sent";
  if (status === "not_configured") return "Email not configured";
  if (status === "missing_email") return "No email";
  if (status === "failed") return "Reminder failed";
  return "No reminder yet";
}

function manualCreditBanner(params: Params) {
  if (params.creditAdjustment === "added") {
    return {
      tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
      text: `${params.added || "Credits"} credit${params.added === "1" ? "" : "s"} added to ${params.student || "the student"}. The adjustment has been recorded in the credit ledger.`,
    };
  }
  if (params.creditAdjustment === "removed") {
    return {
      tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
      text: `${params.added || "Credits"} credit${params.added === "1" ? "" : "s"} removed from ${params.student || "the student"}. The correction has been recorded in the credit ledger.`,
    };
  }
  if (params.creditAdjustment === "invalid") return { tone: "border-rose-200 bg-rose-50 text-rose-800", text: "Credit adjustment could not be completed. Select a valid student, enter a whole number of credits, and provide a reason." };
  if (params.creditAdjustment === "insufficient") return { tone: "border-rose-200 bg-rose-50 text-rose-800", text: "Credits could not be removed because the student does not have enough remaining balance." };
  if (params.creditAdjustment === "failed") return { tone: "border-rose-200 bg-rose-50 text-rose-800", text: "The manual credit adjustment could not be completed. No unrecorded credit change was kept." };
  return null;
}

async function addManualCredits(formData: FormData) {
  "use server";
  const session = await requireFeesAccess("credit", "creditMonitoring");
  const role = String((session?.user as any)?.role || "");
  if (!session?.user || (role !== "admin" && role !== "sub-admin")) throw new Error("Forbidden");

  const assignmentId = String(formData.get("assignment") || "").trim();
  const rawCredits = Number(formData.get("credits"));
  const reason = String(formData.get("reason") || "").trim();
  if (!isValidObjectId(assignmentId) || !Number.isInteger(rawCredits) || rawCredits < 1 || rawCredits > 1000 || reason.length < 5 || reason.length > 500) {
    redirect("/fees/credit-monitoring?view=add&creditAdjustment=invalid");
  }

  await dbConnect();
  let updated: any;
  try {
    updated = await FeeAssignment.findOneAndUpdate(
      { _id: assignmentId, type: "credits" },
      { $inc: { creditBalance: rawCredits, totalCreditsPurchased: rawCredits } },
      { new: true }
    ).populate("student", "name username email parentName parentEmail");
  } catch {
    redirect("/fees/credit-monitoring?view=add&creditAdjustment=failed");
  }
  if (!updated?.student?._id) redirect("/fees/credit-monitoring?view=add&creditAdjustment=invalid");

  const balanceAfter = Number(updated.creditBalance || 0);
  try {
    const ledger = await CreditLedger.create({
      student: updated.student._id,
      assignment: updated._id,
      type: "adjustment",
      credits: rawCredits,
      balanceAfter,
      sourceType: "manual_credit",
      sourceId: new Types.ObjectId(),
      performedBy: (session.user as any).id,
      performedByRole: role,
      note: reason,
    });
    await recordActivity({
      actor: (session.user as any).id,
      targetUser: updated.student._id.toString(),
      type: "fees.credits.manual_added",
      label: `Added ${rawCredits} manual credit${rawCredits === 1 ? "" : "s"} to ${updated.student.name || updated.student.username || "student"}`,
      entityType: "CreditLedger",
      entityId: ledger._id.toString(),
      metadata: {
        assignment: updated._id.toString(),
        credits: rawCredits,
        balanceAfter,
        reason,
        source: "manual_admin",
        performedByRole: role,
      },
    });
  } catch {
    await FeeAssignment.updateOne(
      { _id: updated._id, creditBalance: balanceAfter },
      { $inc: { creditBalance: -rawCredits, totalCreditsPurchased: -rawCredits } }
    ).catch(() => null);
    redirect("/fees/credit-monitoring?view=add&creditAdjustment=failed");
  }

  await Notification.create({
    user: updated.student._id,
    type: "credits.manual_addition",
    title: "Class credits added",
    message: `${rawCredits} class credit${rawCredits === 1 ? "" : "s"} ${rawCredits === 1 ? "has" : "have"} been added to your account. Reason: ${reason}`,
    metadata: { assignment: updated._id.toString(), credits: rawCredits, balanceAfter, reason },
  }).catch(() => null);
  await sendCreditAdjustmentEmail({
    student: updated.student,
    credits: rawCredits,
    balanceAfter,
    reason,
    adjustment: "added",
  }).catch((error) => console.error("Credit added email failed", error));

  revalidatePath("/fees");
  revalidatePath("/fees/credit-history");
  revalidatePath("/fees/credit-monitoring");
  const params = new URLSearchParams({
    creditAdjustment: "added",
    view: "add",
    added: String(rawCredits),
    student: updated.student.name || updated.student.username || "student",
  });
  redirect(`/fees/credit-monitoring?${params.toString()}`);
}

async function removeManualCredits(formData: FormData) {
  "use server";
  const session = await requireFeesAccess("credit", "creditMonitoring");
  const role = String((session?.user as any)?.role || "");
  if (!session?.user || (role !== "admin" && role !== "sub-admin")) throw new Error("Forbidden");

  const assignmentId = String(formData.get("assignment") || "").trim();
  const rawCredits = Number(formData.get("credits"));
  const reason = String(formData.get("reason") || "").trim();
  if (!isValidObjectId(assignmentId) || !Number.isInteger(rawCredits) || rawCredits < 1 || rawCredits > 1000 || reason.length < 5 || reason.length > 500) {
    redirect("/fees/credit-monitoring?view=deduct&creditAdjustment=invalid");
  }

  await dbConnect();
  const existing: any = await FeeAssignment.findOne({ _id: assignmentId, type: "credits" }).populate("student", "name username email parentName parentEmail");
  if (!existing?.student?._id) redirect("/fees/credit-monitoring?view=deduct&creditAdjustment=invalid");

  const balanceBefore = Number(existing.creditBalance || 0);
  if (balanceBefore < rawCredits) redirect("/fees/credit-monitoring?view=deduct&creditAdjustment=insufficient");

  const purchasedBefore = Number(existing.totalCreditsPurchased || 0);
  const balanceAfter = balanceBefore - rawCredits;
  const totalCreditsPurchased = Math.max(0, purchasedBefore - rawCredits);

  let modified = false;
  try {
    const update = await FeeAssignment.updateOne(
      { _id: existing._id, type: "credits", creditBalance: balanceBefore },
      { $set: { creditBalance: balanceAfter, totalCreditsPurchased } }
    );
    modified = Boolean(update.modifiedCount);
  } catch {
    redirect("/fees/credit-monitoring?view=deduct&creditAdjustment=failed");
  }
  if (!modified) redirect("/fees/credit-monitoring?view=deduct&creditAdjustment=failed");

  try {
    const ledger = await CreditLedger.create({
      student: existing.student._id,
      assignment: existing._id,
      type: "adjustment",
      credits: -rawCredits,
      balanceAfter,
      sourceType: "manual_credit_reversal",
      sourceId: new Types.ObjectId(),
      performedBy: (session.user as any).id,
      performedByRole: role,
      note: reason,
    });
    await recordActivity({
      actor: (session.user as any).id,
      targetUser: existing.student._id.toString(),
      type: "fees.credits.manual_removed",
      label: `Removed ${rawCredits} manual credit${rawCredits === 1 ? "" : "s"} from ${existing.student.name || existing.student.username || "student"}`,
      entityType: "CreditLedger",
      entityId: ledger._id.toString(),
      metadata: {
        assignment: existing._id.toString(),
        credits: -rawCredits,
        balanceAfter,
        reason,
        source: "manual_admin",
        performedByRole: role,
      },
    });
  } catch {
    await FeeAssignment.updateOne(
      { _id: existing._id, creditBalance: balanceAfter },
      { $set: { creditBalance: balanceBefore, totalCreditsPurchased: purchasedBefore } }
    ).catch(() => null);
    redirect("/fees/credit-monitoring?view=deduct&creditAdjustment=failed");
  }

  await Notification.create({
    user: existing.student._id,
    type: "credits.manual_removal",
    title: "Class credits corrected",
    message: `${rawCredits} class credit${rawCredits === 1 ? "" : "s"} ${rawCredits === 1 ? "has" : "have"} been removed from your account. Reason: ${reason}`,
    metadata: { assignment: existing._id.toString(), credits: -rawCredits, balanceAfter, reason },
  }).catch(() => null);
  await sendCreditAdjustmentEmail({
    student: existing.student,
    credits: rawCredits,
    balanceAfter,
    reason,
    adjustment: "removed",
  }).catch((error) => console.error("Credit removed email failed", error));

  revalidatePath("/fees");
  revalidatePath("/fees/credit-history");
  revalidatePath("/fees/credit-monitoring");
  const params = new URLSearchParams({
    creditAdjustment: "removed",
    view: "deduct",
    added: String(rawCredits),
    student: existing.student.name || existing.student.username || "student",
  });
  redirect(`/fees/credit-monitoring?${params.toString()}`);
}

function statusFor(balance: number) {
  if (balance <= -1) return { label: "Blocked", tone: "bg-rose-50 text-rose-700 ring-rose-200", icon: XCircle };
  if (balance === 0) return { label: "Final class available", tone: "bg-violet-50 text-violet-700 ring-violet-200", icon: AlertTriangle };
  if (balance === 1) return { label: "Low credit alert", tone: "bg-amber-50 text-amber-700 ring-amber-200", icon: AlertTriangle };
  return { label: "Healthy", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200", icon: CheckCircle2 };
}

type ViewKey = "students" | "add" | "deduct" | "history";

function selectedView(value?: string): ViewKey {
  if (value === "add" || value === "deduct" || value === "history") return value;
  return "students";
}

function pageHref(params: Params, updates: Partial<Params>) {
  const next = new URLSearchParams();
  const merged = { ...params, ...updates };
  (["view", "q", "filter", "plan", "min", "max"] as Array<keyof Params>).forEach((key) => {
    const raw = merged[key];
    const value = String(raw || "");
    if (value) next.set(key, value);
  });
  return `/fees/credit-monitoring?${next.toString()}`;
}

function toolHref(view: ViewKey) {
  return `/fees/credit-monitoring?view=${view}`;
}

function ToolCard({ href, active, label, count, icon, tone }: { href: string; active: boolean; label: string; count?: string | number; icon: React.ReactNode; tone: string }) {
  return (
    <a
      href={href}
      className={`flex min-h-[78px] items-center gap-3 rounded-lg border bg-white px-3 py-3 text-left shadow-sm transition hover:border-brand/25 hover:bg-slate-50 ${active ? "border-brand/35 ring-2 ring-brand/10" : "border-slate-200"}`}
    >
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

function StatusLink({ href, active, label, value }: { href: string; active: boolean; label: string; value: number }) {
  return (
    <a className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${active ? "border-brand/30 bg-brand/10 text-brand" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`} href={href}>
      {label} <span className="ml-1 text-slate-500">{value}</span>
    </a>
  );
}

export default async function CreditMonitoringPage({ searchParams }: { searchParams?: Promise<Params> }) {
  const session = await auth();
  const role = String((session?.user as any)?.role || "");
  const userId = String((session?.user as any)?.id || "");
  const permissions = session?.user
    ? await getFeaturePermissionState("creditMonitoring", session.user as any, ["view", "credit", "export"])
    : { view: false, credit: false, export: false };
  if (!permissions.view || !userId) return <div className="p-6">Forbidden</div>;
  const manager = role === "admin" || role === "sub-admin";
  await dbConnect();
  const params = searchParams ? await searchParams : {};
  if (value(params, "view") === "reminders") redirect("/fees/reminders");
  const q = value(params, "q").toLowerCase();
  const filter = value(params, "filter") || "all";
  const plan = value(params, "plan");
  const min = value(params, "min");
  const max = value(params, "max");
  const view = selectedView(value(params, "view"));

  const [allAssignments, plans, ledgers] = await Promise.all([
    FeeAssignment.find(manager ? { type: "credits" } : { type: "credits", student: userId }).populate("student plan").sort({ creditBalance: 1 }).lean(),
    FeePlan.find(manager ? { type: "credits" } : { type: "credits", isActive: true }).sort({ name: 1 }).lean(),
    CreditLedger.find(manager ? {} : { student: userId }).populate("student invoice performedBy").sort({ createdAt: -1 }).limit(120).lean(),
  ]);

  const assignments = allAssignments
    .filter((assignment: any) => !q || `${assignment.student?.name || ""} ${assignment.student?.username || ""} ${assignment.student?.email || ""}`.toLowerCase().includes(q))
    .filter((assignment: any) => !plan || assignment.plan?._id?.toString?.() === plan)
    .filter((assignment: any) => filter !== "low" || Number(assignment.creditBalance || 0) === 1)
    .filter((assignment: any) => filter !== "empty" || Number(assignment.creditBalance || 0) <= 0)
    .filter((assignment: any) => filter !== "healthy" || Number(assignment.creditBalance || 0) > 1)
    .filter((assignment: any) => !min || Number(assignment.creditBalance || 0) >= Number(min))
    .filter((assignment: any) => !max || Number(assignment.creditBalance || 0) <= Number(max));

  const totalStudents = allAssignments.length;
  const lowCount = allAssignments.filter((assignment: any) => Number(assignment.creditBalance || 0) === 1).length;
  const emptyCount = allAssignments.filter((assignment: any) => Number(assignment.creditBalance || 0) <= 0).length;
  const healthyCount = allAssignments.filter((assignment: any) => Number(assignment.creditBalance || 0) > 1).length;
  const adjustmentBanner = manualCreditBanner(params);
  const canAddManualCredits = manager && permissions.credit;
  const creditStudents = allAssignments
    .filter((assignment: any) => assignment.student?._id)
    .map((assignment: any) => ({
      assignmentId: assignment._id.toString(),
      studentId: assignment.student._id.toString(),
      name: assignment.student.name || assignment.student.username || assignment.student.email || "Student",
      username: assignment.student.username || "",
      email: assignment.student.email || "",
      balance: Number(assignment.creditBalance || 0),
    }))
    .sort((a: any, b: any) => a.name.localeCompare(b.name));

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
      <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-brand/10 text-brand"><WalletCards size={18} /></span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand/70">Credit control</p>
            <h1 className="text-xl font-bold text-slate-950">Credit Monitoring</h1>
          </div>
        </div>
      </section>

      {adjustmentBanner && (
        <div className={`mb-4 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-semibold ${adjustmentBanner.tone}`}>
          <CheckCircle2 size={18} />
          {adjustmentBanner.text}
        </div>
      )}

      <nav className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <ToolCard href={toolHref("students")} active={view === "students"} label="Students" count={`${totalStudents} credit-plan students`} icon={<WalletCards size={17} />} tone="bg-purple-50 text-purple-700" />
        {canAddManualCredits && <ToolCard href={toolHref("add")} active={view === "add"} label="Add Credits" icon={<CheckCircle2 size={17} />} tone="bg-emerald-50 text-emerald-700" />}
        {canAddManualCredits && <ToolCard href={toolHref("deduct")} active={view === "deduct"} label="Deduct Credits" icon={<XCircle size={17} />} tone="bg-rose-50 text-rose-700" />}
        <ToolCard href={toolHref("history")} active={view === "history"} label="Credit Movement" count={`${ledgers.length} recent entries`} icon={<Download size={17} />} tone="bg-slate-100 text-slate-700" />
      </nav>

      {view === "add" && canAddManualCredits && (
        <section className="rounded-lg border border-emerald-200 bg-white p-4 shadow-sm">
          <SectionTitle title="Add Credits" note="For complimentary or approved manual credit additions." />
          <ManualCreditForm students={creditStudents} action={addManualCredits} />
        </section>
      )}

      {view === "deduct" && canAddManualCredits && (
        <section className="rounded-lg border border-rose-200 bg-white p-4 shadow-sm">
          <SectionTitle title="Deduct Credits" note="For correcting mistaken additions. The credit ledger keeps the correction visible." />
          <ManualCreditForm students={creditStudents} action={removeManualCredits} mode="remove" />
        </section>
      )}


      {view === "students" && (
        <>
          <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <SectionTitle title="Student Lists" note="Click a group to see only those students." />
            <div className="mb-4 flex flex-wrap gap-2">
              <StatusLink href={pageHref(params, { view: "students", filter: "all" })} active={filter === "all"} label="All" value={totalStudents} />
              <StatusLink href={pageHref(params, { view: "students", filter: "low" })} active={filter === "low"} label="Low" value={lowCount} />
              <StatusLink href={pageHref(params, { view: "students", filter: "empty" })} active={filter === "empty"} label="Empty" value={emptyCount} />
              <StatusLink href={pageHref(params, { view: "students", filter: "healthy" })} active={filter === "healthy"} label="Healthy" value={healthyCount} />
            </div>
            <form className="grid gap-3 lg:grid-cols-[minmax(220px,1.2fr)_170px_180px_110px_110px_auto] lg:items-end">
              <input type="hidden" name="view" value="students" />
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Search</span>
                <span className="relative block">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                  <input name="q" defaultValue={value(params, "q")} className="input h-10 pl-9 text-sm" placeholder="Name, ID, or email" />
                </span>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Status</span>
                <select name="filter" defaultValue={filter} className="input h-10 text-sm">
                  <option value="all">All students</option>
                  <option value="low">Low credits</option>
                  <option value="empty">Zero credits</option>
                  <option value="healthy">Healthy</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Plan</span>
                <select name="plan" defaultValue={plan} className="input h-10 text-sm">
                  <option value="">All plans</option>
                  {plans.map((item: any) => <option key={item._id.toString()} value={item._id.toString()}>{item.name}</option>)}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Min</span>
                <input name="min" type="number" min="0" defaultValue={min} className="input h-10 text-sm" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Max</span>
                <input name="max" type="number" min="0" defaultValue={max} className="input h-10 text-sm" />
              </label>
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary h-10 text-sm"><Filter size={14} /> Apply</button>
                {permissions.export && <a href={exportHref(params, "xls")} className="btn-outline h-10 text-sm"><Download size={14} /> XLS</a>}
                {permissions.export && <a href={exportHref(params, "csv")} className="btn-outline h-10 text-sm"><Download size={14} /> CSV</a>}
              </div>
            </form>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <SectionTitle
              title={manager ? "Students by Credit Balance" : "Your Credit Balance"}
              note={manager ? "Student names open their invoices." : "Track your purchased, used, and remaining class credits."}
              action={<span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-bold text-brand">{assignments.length} visible</span>}
            />

            {assignments.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                <h3 className="text-sm font-bold text-slate-950">No matching credit students</h3>
                <p className="mt-1 text-xs text-slate-500">Clear the search or widen the credit range.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500">
                    <tr>
                      <th className="px-3 py-3">Student</th>
                      <th className="px-3 py-3">Plan</th>
                      <th className="px-3 py-3">Purchased</th>
                      <th className="px-3 py-3">Consumed</th>
                      <th className="px-3 py-3">Balance</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Reminder</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((assignment: any) => {
                      const balance = Number(assignment.creditBalance || 0);
                      const purchased = Number(assignment.totalCreditsPurchased || 0);
                      const consumed = Number(assignment.totalCreditsConsumed || 0);
                      const status = statusFor(balance);
                      const StatusIcon = status.icon;
                      const studentId = assignment.student?._id?.toString?.() || "";
                      return (
                        <tr key={assignment._id.toString()} className="border-b last:border-0 hover:bg-slate-50">
                          <td className="px-3 py-3">
                            {manager ? (
                              <a href={studentId ? `/fees/invoices?student=${studentId}` : "#"} className="font-semibold text-brand hover:underline">{assignment.student?.name || "Student"}</a>
                            ) : (
                              <span className="font-semibold text-slate-950">{assignment.student?.name || "Student"}</span>
                            )}
                            <div className="mt-0.5 text-xs text-slate-500">{assignment.student?.username || assignment.student?.email || "-"}</div>
                          </td>
                          <td className="px-3 py-3">{assignment.plan?.name || "-"}</td>
                          <td className="px-3 py-3 font-semibold">{purchased}</td>
                          <td className="px-3 py-3 font-semibold">{consumed}</td>
                          <td className={`px-3 py-3 font-bold ${balance <= 1 ? "text-rose-600" : "text-emerald-700"}`}>{balance}</td>
                          <td className="px-3 py-3">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ring-1 ${status.tone}`}>
                              <StatusIcon size={12} /> {status.label}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-xs text-slate-500">
                            {reminderStatusCopy(String(assignment.lastCreditReminderStatus || ""))}
                            {assignment.lastCreditReminderAt ? <span className="block">{new Date(assignment.lastCreditReminderAt).toLocaleDateString("en-IN")}</span> : null}
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
          <SectionTitle
            title="Recent Credit Movement"
            note="Recharge, class use, and manual adjustments."
            action={permissions.export ? <a href={exportHref(params, "history")} className="btn-outline h-10 text-sm"><Download size={14} /> History CSV</a> : null}
          />
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-3 py-3">Student</th>
                  <th className="px-3 py-3">Movement</th>
                  <th className="px-3 py-3">Reason</th>
                  <th className="px-3 py-3">By</th>
                  <th className="px-3 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {ledgers.map((ledger: any) => {
                  const credits = Number(ledger.credits || 0);
                  const studentId = ledger.student?._id?.toString?.() || "";
                  return (
                    <tr key={ledger._id.toString()} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="px-3 py-3">
                        {manager ? (
                          <a href={studentId ? `/fees/invoices?student=${studentId}` : "#"} className="font-semibold text-brand hover:underline">{ledger.student?.name || "Student"}</a>
                        ) : (
                          <span className="font-semibold text-slate-950">{ledger.student?.name || "Student"}</span>
                        )}
                      </td>
                      <td className={`px-3 py-3 font-bold ${credits >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{credits >= 0 ? `+${credits}` : credits}</td>
                      <td className="max-w-md px-3 py-3 text-xs text-slate-600">{ledger.note || ledger.type}</td>
                      <td className="px-3 py-3 text-xs text-slate-500">{ledger.performedBy ? `${ledger.performedBy.name || ledger.performedBy.username || "Administrator"}${ledger.performedByRole ? ` (${ledger.performedByRole})` : ""}` : "-"}</td>
                      <td className="px-3 py-3 text-xs text-slate-500">{new Date(ledger.createdAt).toLocaleDateString("en-IN")}</td>
                    </tr>
                  );
                })}
                {ledgers.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">No credit movement yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
