import { auth } from "@/lib/auth";
import { resolvePublicAppUrl } from "@/lib/appUrl";
import { dbConnect } from "@/lib/db";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { sendWhatsAppReminder } from "@/lib/whatsappAutomation";
import { formatINR } from "@/lib/utils";
import { AcademySettings, CreditLedger, FeeAssignment, FeePlan, Notification } from "@/models/Fee";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, Download, Filter, MailCheck, MailWarning, MessageCircle, Search, Send, WalletCards, XCircle } from "lucide-react";
import { getFeaturePermissionState } from "@/lib/featureAccess";
import { requireFeesAccess } from "@/lib/feesAccess";
import ManualCreditForm from "@/components/fees/ManualCreditForm";
import { isValidObjectId, Types } from "mongoose";

export const dynamic = "force-dynamic";

type Params = { q?: string; filter?: string; plan?: string; min?: string; max?: string; creditAdjustment?: string; added?: string; student?: string };
type ReminderDelivery = Awaited<ReturnType<typeof sendAutomationEmail>>;
type WhatsAppDelivery = Awaited<ReturnType<typeof sendWhatsAppReminder>>;
type ReminderSummary = { sent: number; failed: number; missing: number; skipped: number; total: number };

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

function deliveryStatus(delivery: ReminderDelivery) {
  if (delivery.delivered) return "sent";
  if (delivery.skipped) return "not_configured";
  return "failed";
}

function whatsappStatus(delivery: WhatsAppDelivery) {
  if (delivery.delivered) return "sent";
  if (delivery.skipped) return "not_configured";
  return "failed";
}

function whatsappErrorParam(delivery: WhatsAppDelivery) {
  if (delivery.delivered || delivery.skipped) return "";
  const message = "errorMessage" in delivery ? delivery.errorMessage : "";
  return message ? `&waError=${encodeURIComponent(String(message).slice(0, 180))}` : "";
}

function reminderStatusCopy(status?: string) {
  if (status === "sent") return "Reminder sent";
  if (status === "not_configured") return "Email not configured";
  if (status === "missing_email") return "No email";
  if (status === "failed") return "Reminder failed";
  return "No reminder yet";
}

function bulkReminderRedirect(summary: ReminderSummary) {
  const params = new URLSearchParams({
    creditReminder: "sent",
    sent: String(summary.sent),
    failed: String(summary.failed),
    missing: String(summary.missing),
    skipped: String(summary.skipped),
    total: String(summary.total),
  });
  redirect(`/fees/credit-monitoring?${params.toString()}`);
}

function creditReminderBanner(params: Params & Record<string, string | string[] | undefined>) {
  if (String(params.creditReminder || "") !== "sent") return null;
  const sent = String(params.sent || "0");
  const failed = String(params.failed || "0");
  const missing = String(params.missing || "0");
  const skipped = String(params.skipped || "0");
  const total = String(params.total || "0");
  const hasProblems = Number(failed) || Number(missing) || Number(skipped);
  return {
    tone: hasProblems ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-800",
    icon: hasProblems ? MailWarning : MailCheck,
    text: `Credit reminders processed: ${sent} sent, ${failed} failed, ${missing} missing email, ${skipped} not configured, ${total} total.`,
  };
}

function whatsappBanner(status?: string, error = "") {
  if (status === "sent") return { tone: "border-emerald-200 bg-emerald-50 text-emerald-800", icon: MessageCircle, text: "WhatsApp test reminder sent to the configured test number." };
  if (status === "not_configured") return { tone: "border-amber-200 bg-amber-50 text-amber-800", icon: MailWarning, text: "WhatsApp test was not sent because WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, or WHATSAPP_TEST_RECIPIENT is missing." };
  if (status === "failed") return { tone: "border-rose-200 bg-rose-50 text-rose-800", icon: XCircle, text: error ? `WhatsApp test failed: ${error}` : "WhatsApp test failed. Check the Meta token, phone number ID, template name, and recipient allowlist." };
  return null;
}

function manualCreditBanner(params: Params) {
  if (params.creditAdjustment === "added") {
    return {
      tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
      text: `${params.added || "Credits"} credit${params.added === "1" ? "" : "s"} added to ${params.student || "the student"}. The adjustment has been recorded in the credit ledger.`,
    };
  }
  if (params.creditAdjustment === "invalid") return { tone: "border-rose-200 bg-rose-50 text-rose-800", text: "Credits could not be added. Select a valid student, enter a whole number of credits, and provide a reason." };
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
    redirect("/fees/credit-monitoring?creditAdjustment=invalid");
  }

  await dbConnect();
  let updated: any;
  try {
    updated = await FeeAssignment.findOneAndUpdate(
      { _id: assignmentId, type: "credits" },
      { $inc: { creditBalance: rawCredits, totalCreditsPurchased: rawCredits } },
      { new: true }
    ).populate("student", "name username email");
  } catch {
    redirect("/fees/credit-monitoring?creditAdjustment=failed");
  }
  if (!updated?.student?._id) redirect("/fees/credit-monitoring?creditAdjustment=invalid");

  const balanceAfter = Number(updated.creditBalance || 0);
  try {
    await CreditLedger.create({
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
  } catch {
    await FeeAssignment.updateOne(
      { _id: updated._id, creditBalance: balanceAfter },
      { $inc: { creditBalance: -rawCredits, totalCreditsPurchased: -rawCredits } }
    ).catch(() => null);
    redirect("/fees/credit-monitoring?creditAdjustment=failed");
  }

  await Notification.create({
    user: updated.student._id,
    type: "credits.manual_addition",
    title: "Class credits added",
    message: `${rawCredits} class credit${rawCredits === 1 ? "" : "s"} ${rawCredits === 1 ? "has" : "have"} been added to your account. Reason: ${reason}`,
    metadata: { assignment: updated._id.toString(), credits: rawCredits, balanceAfter, reason },
  }).catch(() => null);

  revalidatePath("/fees");
  revalidatePath("/fees/credit-history");
  revalidatePath("/fees/credit-monitoring");
  const params = new URLSearchParams({
    creditAdjustment: "added",
    added: String(rawCredits),
    student: updated.student.name || updated.student.username || "student",
  });
  redirect(`/fees/credit-monitoring?${params.toString()}`);
}

function creditReminderMessage(assignment: any, portalUrl: string) {
  const student = assignment.student;
  const balance = Number(assignment.creditBalance || 0);
  return [
    `Hello ${student.name},`,
    balance <= 0
      ? "Your class credit balance is now 0. Please recharge before booking or attending the next credit-based class."
      : `Your class credit balance is low. You currently have ${balance} credit${balance === 1 ? "" : "s"} remaining.`,
    assignment.plan?.name ? `Current plan: ${assignment.plan.name}.` : "",
    assignment.plan?.amount ? `Recharge plan amount: ${formatINR(assignment.plan.amount)}.` : "",
    portalUrl ? `Open your student billing page: ${portalUrl}` : "Please log in to your student portal to review credits and invoices.",
    "If you have already recharged, please ignore this message.",
  ].filter(Boolean).join("\n\n");
}

async function sendBulkCreditReminders(formData: FormData) {
  "use server";
  if (!(await requireFeesAccess("credit", "creditMonitoring"))) throw new Error("Forbidden");
  await dbConnect();
  const mode = String(formData.get("creditReminderMode") || "low");
  const settings: any = await AcademySettings.findOne().lean();
  const lowCreditThreshold = Math.max(1, Number(settings?.lowCreditThreshold || 3));
  const threshold = mode === "empty" ? 0 : lowCreditThreshold;
  const assignments: any[] = await FeeAssignment.find({ type: "credits", creditBalance: { $lte: threshold } }).populate("student plan").sort({ creditBalance: 1 }).limit(500).lean();
  const baseUrl = resolvePublicAppUrl();
  const portalUrl = baseUrl ? `${baseUrl}/fees` : "";
  const summary: ReminderSummary = { sent: 0, failed: 0, missing: 0, skipped: 0, total: assignments.length };

  for (const assignment of assignments) {
    const student = assignment.student;
    const balance = Number(assignment.creditBalance || 0);
    if (!student?._id || !student.email) {
      summary.missing += 1;
      await FeeAssignment.findByIdAndUpdate(assignment._id, { lastCreditReminderStatus: "missing_email", lastCreditReminderAt: new Date(), lastCreditReminderTo: "" });
      continue;
    }
    const delivery = await sendAutomationEmail({
      to: student.email,
      subject: balance <= 0 ? "Recharge required: class credits are finished" : "Low credit reminder from Envision Chess Academy",
      message: creditReminderMessage(assignment, portalUrl),
      metadata: {
        kind: "credit_reminder",
        studentId: student.username || student._id.toString(),
        studentObjectId: student._id.toString(),
        assignmentId: assignment._id.toString(),
        creditBalance: balance,
        planName: assignment.plan?.name || "",
        portalUrl,
        previewText: "A class credit balance reminder from Envision Chess Academy.",
      },
    });
    const status = deliveryStatus(delivery);
    if (status === "sent") summary.sent += 1;
    else if (status === "not_configured") summary.skipped += 1;
    else summary.failed += 1;
    await FeeAssignment.findByIdAndUpdate(assignment._id, {
      lastCreditReminderAt: new Date(),
      lastCreditReminderTo: student.email,
      lastCreditReminderStatus: status,
    });
    if (status === "sent") {
      await Notification.create({
        user: student._id,
        type: "credits.reminder",
        title: balance <= 0 ? "Credit recharge required" : "Low credit reminder",
        message: balance <= 0 ? "Your class credits are finished. Please recharge before your next credit-based class." : `Your remaining class credits are low (${balance}).`,
        metadata: { assignment: assignment._id.toString(), email: student.email, balance },
      });
    }
  }

  revalidatePath("/fees/credit-monitoring");
  bulkReminderRedirect(summary);
}

async function sendCreditWhatsAppTest(formData: FormData) {
  "use server";
  if (!(await requireFeesAccess("credit", "creditMonitoring"))) throw new Error("Forbidden");
  await dbConnect();
  const assignmentId = String(formData.get("assignment") || "");
  const assignment: any = await FeeAssignment.findById(assignmentId).populate("student plan").lean();
  if (!assignment?.student?._id) redirect("/fees/credit-monitoring?whatsapp=failed");
  const baseUrl = resolvePublicAppUrl();
  const portalUrl = baseUrl ? `${baseUrl}/fees` : "";
  const delivery = await sendWhatsAppReminder({
    message: creditReminderMessage(assignment, portalUrl),
    templateText: assignment.student.name || "Student",
    metadata: {
      kind: "credit_whatsapp_test",
      assignmentId: assignment._id.toString(),
      studentId: assignment.student.username || assignment.student._id.toString(),
      creditBalance: Number(assignment.creditBalance || 0),
      portalUrl,
    },
  });
  redirect(`/fees/credit-monitoring?whatsapp=${whatsappStatus(delivery)}${whatsappErrorParam(delivery)}`);
}

function statusFor(balance: number) {
  if (balance <= 0) return { label: "Recharge required", tone: "bg-rose-50 text-rose-700 ring-rose-200", icon: XCircle };
  if (balance <= 3) return { label: "Low credit alert", tone: "bg-amber-50 text-amber-700 ring-amber-200", icon: AlertTriangle };
  return { label: "Healthy", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200", icon: CheckCircle2 };
}

function MiniStat({ label, value, note, icon }: { label: string; value: string | number; note: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
        <span className="text-brand">{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-2xl font-black text-slate-950">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{note}</div>
    </div>
  );
}

export default async function CreditMonitoringPage({ searchParams }: { searchParams?: Promise<Params> }) {
  const session = await auth();
  const role = String((session?.user as any)?.role || "");
  const permissions = session?.user
    ? await getFeaturePermissionState("fees", session.user as any, ["credit", "export"])
    : { credit: false, export: false };
  if (!permissions.credit) return <div className="p-6">Forbidden</div>;
  await dbConnect();
  const params = searchParams ? await searchParams : {};
  const q = value(params, "q").toLowerCase();
  const filter = value(params, "filter") || "all";
  const plan = value(params, "plan");
  const min = value(params, "min");
  const max = value(params, "max");

  const [allAssignments, plans, ledgers] = await Promise.all([
    FeeAssignment.find({ type: "credits" }).populate("student plan").sort({ creditBalance: 1 }).lean(),
    FeePlan.find({ type: "credits" }).sort({ name: 1 }).lean(),
    CreditLedger.find({}).populate("student invoice performedBy").sort({ createdAt: -1 }).limit(120).lean(),
  ]);

  const assignments = allAssignments
    .filter((assignment: any) => !q || `${assignment.student?.name || ""} ${assignment.student?.username || ""} ${assignment.student?.email || ""}`.toLowerCase().includes(q))
    .filter((assignment: any) => !plan || assignment.plan?._id?.toString?.() === plan)
    .filter((assignment: any) => filter !== "low" || Number(assignment.creditBalance || 0) <= 3)
    .filter((assignment: any) => filter !== "empty" || Number(assignment.creditBalance || 0) <= 0)
    .filter((assignment: any) => filter !== "healthy" || Number(assignment.creditBalance || 0) > 3)
    .filter((assignment: any) => !min || Number(assignment.creditBalance || 0) >= Number(min))
    .filter((assignment: any) => !max || Number(assignment.creditBalance || 0) <= Number(max));

  const totalStudents = allAssignments.length;
  const lowCount = allAssignments.filter((assignment: any) => Number(assignment.creditBalance || 0) > 0 && Number(assignment.creditBalance || 0) <= 3).length;
  const emptyCount = allAssignments.filter((assignment: any) => Number(assignment.creditBalance || 0) <= 0).length;
  const totalRemaining = allAssignments.reduce((sum: number, assignment: any) => sum + Number(assignment.creditBalance || 0), 0);
  const reminderBanner = creditReminderBanner(params as any);
  const waBanner = whatsappBanner(String((params as any).whatsapp || ""), String((params as any).waError || ""));
  const adjustmentBanner = manualCreditBanner(params);
  const canAddManualCredits = role === "admin" || role === "sub-admin";
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
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <section className="mb-4 rounded-lg border border-brand/10 bg-white p-4 shadow-[0_12px_28px_rgba(90,19,114,0.08)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand"><WalletCards size={21} /></span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-brand/70">Credit control</p>
              <h1 className="mt-1 text-3xl font-black text-slate-950">Credit Monitoring</h1>
              <p className="mt-1 text-sm leading-6 text-slate-500">Find low balances, export recharge lists, and review recent credit movement.</p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            <MiniStat label="Students" value={totalStudents} note="Credit plans assigned" icon={<WalletCards size={15} />} />
            <MiniStat label="Low" value={lowCount} note="1 to 3 credits" icon={<AlertTriangle size={15} />} />
            <MiniStat label="Empty" value={emptyCount} note="0 credits left" icon={<XCircle size={15} />} />
            <MiniStat label="Remaining" value={totalRemaining} note="Total credits" icon={<CheckCircle2 size={15} />} />
          </div>
        </div>
      </section>

      {reminderBanner && (
        <div className={`mb-4 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-semibold ${reminderBanner.tone}`}>
          <reminderBanner.icon size={18} />
          {reminderBanner.text}
        </div>
      )}
      {waBanner && (
        <div className={`mb-4 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-semibold ${waBanner.tone}`}>
          <waBanner.icon size={18} />
          {waBanner.text}
        </div>
      )}
      {adjustmentBanner && (
        <div className={`mb-4 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-semibold ${adjustmentBanner.tone}`}>
          <CheckCircle2 size={18} />
          {adjustmentBanner.text}
        </div>
      )}

      {canAddManualCredits && (
        <section className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-black text-emerald-950">Add Credits Manually</h2>
            <p className="mt-1 text-sm leading-6 text-emerald-800">Search for a credit-plan student, enter the complimentary credits, and record the required reason. The balance and audit history update immediately.</p>
          </div>
          <ManualCreditForm students={creditStudents} action={addManualCredits} />
        </section>
      )}

      <section className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-black text-amber-950">Bulk Credit Email Reminders</h2>
            <p className="mt-1 text-sm leading-6 text-amber-800">Send recharge reminders to students whose credits are low or already finished.</p>
          </div>
          <form action={sendBulkCreditReminders} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select name="creditReminderMode" defaultValue="low" className="h-11 rounded-lg border border-amber-300 bg-white px-3 text-sm font-semibold text-slate-800">
              <option value="low">Low and zero credits</option>
              <option value="empty">Zero credits only</option>
            </select>
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-bold text-white shadow-sm hover:bg-brand-700">
              <Send size={16} /> Send Credit Reminders
            </button>
          </form>
        </div>
      </section>

      <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <form className="grid gap-3 xl:grid-cols-[minmax(240px,1.2fr)_180px_200px_120px_120px_260px] xl:items-end">
          <label className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Search</span>
            <span className="relative block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input name="q" defaultValue={value(params, "q")} className="input h-10 pl-9" placeholder="Name, student ID, or email" />
            </span>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Status</span>
            <select name="filter" defaultValue={filter} className="input h-10">
              <option value="all">All students</option>
              <option value="low">Low credits</option>
              <option value="empty">Zero credits</option>
              <option value="healthy">Healthy</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Plan</span>
            <select name="plan" defaultValue={plan} className="input h-10">
              <option value="">All plans</option>
              {plans.map((item: any) => <option key={item._id.toString()} value={item._id.toString()}>{item.name}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Min</span>
            <input name="min" type="number" min="0" defaultValue={min} className="input h-10" placeholder="0" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Max</span>
            <input name="max" type="number" min="0" defaultValue={max} className="input h-10" placeholder="Any" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary h-10"><Filter size={15} /> Apply</button>
            {permissions.export && <a href={exportHref(params, "xls")} className="btn-outline h-10"><Download size={15} /> XLS</a>}
            {permissions.export && <a href={exportHref(params, "csv")} className="btn-outline h-10"><Download size={15} /> CSV</a>}
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-950">Students by Credit Balance</h2>
            <p className="mt-1 text-sm text-slate-500">Lowest balances appear first. Use filters to create a recharge list.</p>
          </div>
          <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-black text-brand">{assignments.length} visible</span>
        </div>

        {assignments.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <h3 className="font-black text-slate-950">No matching credit students</h3>
            <p className="mt-1 text-sm text-slate-500">Try clearing search or widening the min/max credit range.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {assignments.map((assignment: any) => {
              const balance = Number(assignment.creditBalance || 0);
              const purchased = Number(assignment.totalCreditsPurchased || 0);
              const consumed = Number(assignment.totalCreditsConsumed || 0);
              const usedPercent = purchased > 0 ? Math.min(100, Math.round((consumed / purchased) * 100)) : 0;
              const status = statusFor(balance);
              const StatusIcon = status.icon;
              return (
                <article key={assignment._id.toString()} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand/20 hover:shadow-lg hover:shadow-brand-900/8">
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-black text-slate-950">{assignment.student?.name || "Student"}</h3>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${status.tone}`}>
                          <StatusIcon size={13} />
                          {status.label}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{assignment.student?.username || assignment.student?.email || "-"}</div>
                      <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                        {String(assignment.lastCreditReminderStatus || "") === "sent" ? <MailCheck size={13} className="text-emerald-600" /> : <MailWarning size={13} className="text-amber-600" />}
                        {reminderStatusCopy(String(assignment.lastCreditReminderStatus || ""))}
                        {assignment.lastCreditReminderAt ? ` - ${new Date(assignment.lastCreditReminderAt).toLocaleString("en-IN")}` : ""}
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-4">
                        <div className="rounded-lg bg-slate-50 p-3">
                          <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Plan</div>
                          <div className="mt-1 font-bold text-slate-950">{assignment.plan?.name || "-"}</div>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-3">
                          <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Purchased</div>
                          <div className="mt-1 font-black text-slate-950">{purchased}</div>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-3">
                          <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Consumed</div>
                          <div className="mt-1 font-black text-slate-950">{consumed}</div>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-3">
                          <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Remaining</div>
                          <div className={`mt-1 font-black ${balance <= 3 ? "text-rose-600" : "text-emerald-700"}`}>{balance}</div>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-4">
                      <div className="mb-2 flex items-center justify-between text-xs font-bold text-slate-500">
                        <span>Credit usage</span>
                        <span>{usedPercent}% used</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-white">
                        <div className={`h-full rounded-full ${balance <= 3 ? "bg-rose-500" : "bg-brand"}`} style={{ width: `${usedPercent}%` }} />
                      </div>
                      <div className="mt-3 text-sm leading-6 text-slate-600">
                        {balance <= 0 ? "Recharge should be arranged before the next paid class." : balance <= 3 ? "Student is close to needing a recharge." : "Balance is currently healthy."}
                      </div>
                      <form action={sendCreditWhatsAppTest} className="mt-3">
                        <input type="hidden" name="assignment" value={assignment._id.toString()} />
                        <button className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-white px-3 text-xs font-bold text-emerald-700">
                          <MessageCircle size={14} /> WhatsApp Test
                        </button>
                      </form>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-950">Recent Credit Movement</h2>
            <p className="mt-1 text-sm text-slate-500">Recharge, class consumption, and adjustment entries from the ledger.</p>
          </div>
          {permissions.export && <a href={exportHref(params, "history")} className="btn-outline h-10"><Download size={15} /> History CSV</a>}
        </div>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {ledgers.map((ledger: any) => {
            const credits = Number(ledger.credits || 0);
            return (
              <div key={ledger._id.toString()} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-slate-950">{ledger.student?.name || "Student"} {credits >= 0 ? "received" : "used"} {Math.abs(credits)} credits</div>
                  <div className="truncate text-xs text-slate-500">{ledger.note || ledger.type}</div>
                  {ledger.performedBy && <div className="truncate text-[11px] text-slate-400">Added by {ledger.performedBy.name || ledger.performedBy.username || "Administrator"} ({ledger.performedByRole === "sub-admin" ? "Sub-admin" : "Admin"})</div>}
                </div>
                <div className="shrink-0 text-right">
                  <div className={`font-black ${credits >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{credits >= 0 ? `+${credits}` : credits}</div>
                  <div className="text-xs text-slate-500">{new Date(ledger.createdAt).toLocaleDateString("en-IN")}</div>
                </div>
              </div>
            );
          })}
          {ledgers.length === 0 && <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No credit movement yet.</div>}
        </div>
      </section>
    </div>
  );
}
