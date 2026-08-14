import { auth } from "@/lib/auth";
import { resolvePublicAppUrl } from "@/lib/appUrl";
import { dbConnect } from "@/lib/db";
import { createInvoice, ensureMonthlyInvoices, markInvoicePaid as applyInvoicePayment } from "@/lib/fees";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { sendWhatsAppReminder } from "@/lib/whatsappAutomation";
import { formatINR } from "@/lib/utils";
import { CreditLedger, FeeAssignment, FeePlan, Invoice, Notification } from "@/models/Fee";
import { User } from "@/models/User";
import { createHash, randomBytes } from "crypto";
import PayButton from "@/components/PayButton";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AlertCircle, CheckCircle2, Clock3, Download, FileText, IndianRupee, MailCheck, MailWarning, MessageCircle, Printer, Receipt, Send, Trash2, XCircle } from "lucide-react";
import { InvoiceCreationForm } from "@/components/fees/InvoiceCreationForm";
import { canAccessFeature, getFeaturePermissionState } from "@/lib/featureAccess";
import { isFeesManager, requireFeesAccess } from "@/lib/feesAccess";
import { recordActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

type ReminderDelivery = Awaited<ReturnType<typeof sendAutomationEmail>>;
type WhatsAppDelivery = Awaited<ReturnType<typeof sendWhatsAppReminder>>;
type ReminderSummary = { sent: number; failed: number; missing: number; skipped: number; total: number };

function paise(value: FormDataEntryValue | null) {
  return Math.round(Number(value || 0) * 100);
}

function hashInvoiceToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function createPublicInvoiceUrl(invoiceId: string) {
  const baseUrl = resolvePublicAppUrl();
  if (!baseUrl) return "";
  const token = randomBytes(32).toString("base64url");
  await Invoice.findByIdAndUpdate(invoiceId, {
    publicDownloadTokenHash: hashInvoiceToken(token),
    publicDownloadTokenExpiresAt: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
  });
  return `${baseUrl}/api/fees/invoices/${invoiceId}/pdf?token=${encodeURIComponent(token)}`;
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

function bulkReminderRedirect(summary: ReminderSummary, kind = "invoice_reminders") {
  const params = new URLSearchParams({
    bulk: kind,
    sent: String(summary.sent),
    failed: String(summary.failed),
    missing: String(summary.missing),
    skipped: String(summary.skipped),
    total: String(summary.total),
  });
  redirect(`/fees/invoices?${params.toString()}`);
}

function invoiceReminderMessage(invoice: any, invoiceUrl: string) {
  return [
    `Hello ${invoice.student.name},`,
    `This is a friendly reminder that invoice ${invoice.invoiceNumber} for ${invoice.title} is still pending.`,
    `Total amount: ${formatINR(invoice.totalAmount)}.`,
    `Due date: ${new Date(invoice.dueDate).toLocaleDateString("en-IN")}.`,
    invoiceUrl ? `Download invoice: ${invoiceUrl}` : "Please log in to your student portal to view and pay the invoice.",
    "If you have already paid, please ignore this message or share the payment reference with the academy.",
  ].join("\n\n");
}

async function createManualInvoice(formData: FormData) {
  "use server";
  const session = await requireFeesAccess("invoice", "invoices");
  if (!session) throw new Error("Forbidden");
  await dbConnect();
  const invoiceType = String(formData.get("type") || "manual");
  const plan: any = invoiceType === "manual" ? null : await FeePlan.findById(formData.get("plan"));
  if (invoiceType !== "manual" && !plan) return;
  const amount = formData.get("amount") ? paise(formData.get("amount")) : Number(plan?.amount || 0);
  if (amount <= 0) return;
  await createInvoice({
    student: String(formData.get("student")),
    plan: plan?._id?.toString(),
    type: invoiceType === "manual" ? "manual" : plan.type,
    title: String(formData.get("title") || plan?.name || "Custom Invoice"),
    amount,
    issueDate: new Date(String(formData.get("invoiceDate") || "")),
    dueDate: new Date(String(formData.get("dueDate"))),
    referenceNumber: String(formData.get("referenceNumber") || ""),
    credits: invoiceType !== "manual" && plan.type === "credits" ? plan.credits : 0,
    notes: String(formData.get("notes") || ""),
    invoiceMode: String(formData.get("invoiceMode") || plan?.gstMode || "non_gst") as any,
    gstPercentage: Number(formData.get("gstPercentage") || plan?.gstPercentage || 0),
    activity: {
      actor: (session.user as any).id,
      source: "manual_admin",
      label: `Created ${invoiceType === "manual" ? "manual" : invoiceType} invoice`,
    },
  });
  revalidatePath("/fees/invoices");
}

async function markInvoicePaid(formData: FormData) {
  "use server";
  const session = await requireFeesAccess("payment", "invoices");
  if (!session) throw new Error("Forbidden");
  await dbConnect();
  const invoiceId = String(formData.get("invoice") || "");
  const invoice: any = await Invoice.findById(invoiceId).select("type").lean();
  if (invoice?.type === "credits" && !(await canAccessFeature("invoices", session.user as any, "credit"))) {
    throw new Error("Forbidden");
  }
  await applyInvoicePayment(invoiceId, undefined, { actor: (session.user as any).id, source: "manual_admin" });
  revalidatePath("/fees/invoices");
  revalidatePath("/fees/student-fees");
  revalidatePath("/fees");
}

async function cancelInvoice(formData: FormData) {
  "use server";
  const session = await requireFeesAccess("edit", "invoices");
  if (!session) throw new Error("Forbidden");
  await dbConnect();
  const invoice: any = await Invoice.findByIdAndUpdate(formData.get("invoice"), { status: "cancelled" }, { new: true }).lean();
  if (invoice) {
    await recordActivity({
      actor: (session.user as any).id,
      targetUser: invoice.student?.toString?.() || String(invoice.student || ""),
      type: "fees.invoice.cancelled",
      label: `Cancelled invoice ${invoice.invoiceNumber}`,
      entityType: "Invoice",
      entityId: invoice._id.toString(),
      metadata: { invoiceNumber: invoice.invoiceNumber, amount: invoice.totalAmount, source: "manual_admin" },
    });
  }
  revalidatePath("/fees/invoices");
}

async function deleteInvoice(formData: FormData) {
  "use server";
  const session = await requireFeesAccess("edit", "invoices");
  if (!session) throw new Error("Forbidden");
  await dbConnect();
  const invoiceId = String(formData.get("invoice") || "");
  const invoice: any = await Invoice.findById(invoiceId).lean();
  if (!invoice) return;
  if (invoice.type === "credits" && invoice.status === "paid" && !(await canAccessFeature("invoices", session.user as any, "credit"))) {
    throw new Error("Forbidden");
  }
  if (invoice.type === "credits" && invoice.status === "paid" && invoice.credits) {
    const assignment: any = await FeeAssignment.findOne({ student: invoice.student, type: "credits" });
    if (assignment) {
      await FeeAssignment.findByIdAndUpdate(assignment._id, {
        creditBalance: Math.max(0, Number(assignment.creditBalance || 0) - Number(invoice.credits || 0)),
        totalCreditsPurchased: Math.max(0, Number(assignment.totalCreditsPurchased || 0) - Number(invoice.credits || 0)),
      });
    }
  }
  await Promise.all([
    CreditLedger.deleteMany({ invoice: invoice._id }),
    Invoice.findByIdAndDelete(invoice._id),
  ]);
  await recordActivity({
    actor: (session.user as any).id,
    targetUser: invoice.student?.toString?.() || String(invoice.student || ""),
    type: "fees.invoice.deleted",
    label: `Deleted invoice ${invoice.invoiceNumber}`,
    entityType: "Invoice",
    entityId: invoice._id.toString(),
    metadata: {
      invoiceNumber: invoice.invoiceNumber,
      invoiceType: invoice.type,
      status: invoice.status,
      amount: invoice.totalAmount,
      credits: invoice.credits || 0,
      source: "manual_admin",
    },
  });
  revalidatePath("/fees/invoices");
  revalidatePath("/fees/student-fees");
  revalidatePath("/fees");
}

async function sendInvoiceToStudent(formData: FormData) {
  "use server";
  const session = await requireFeesAccess("invoice", "invoices");
  if (!session) throw new Error("Forbidden");
  await dbConnect();
  const invoiceId = String(formData.get("invoice") || "");
  const returnStudent = String(formData.get("studentFilter") || "");
  const returnPath = `/fees/invoices${returnStudent ? `?student=${encodeURIComponent(returnStudent)}&` : "?"}`;
  const invoice: any = await Invoice.findById(invoiceId).populate("student plan").lean();
  if (!invoice?.student?._id) redirect(`${returnPath}send=failed`);
  if (!invoice.student.email) {
    await Invoice.findByIdAndUpdate(invoice._id, { lastEmailStatus: "missing_email", lastSentAt: new Date(), lastSentTo: "" });
    revalidatePath("/fees/invoices");
    redirect(`${returnPath}send=missing_email`);
  }
  const invoiceUrl = await createPublicInvoiceUrl(invoice._id.toString());
  const delivery = await sendAutomationEmail({
    to: invoice.student.email,
    subject: `Invoice ${invoice.invoiceNumber} from Envisions Chess Academy LLP`,
    message: [
      `Hello ${invoice.student.name},`,
      `Your invoice ${invoice.invoiceNumber} for ${invoice.title} is now available.`,
      `Total amount: ${formatINR(invoice.totalAmount)}.`,
      invoiceUrl ? `Download invoice: ${invoiceUrl}` : "Please log in to your student portal to download the invoice.",
    ].join("\n\n"),
    htmlBody: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033">
        <h2 style="color:#5a1372;margin:0 0 12px">Invoice ${invoice.invoiceNumber}</h2>
        <p>Hello ${invoice.student.name},</p>
        <p>Your invoice for <strong>${invoice.title}</strong> is now available.</p>
        <p><strong>Total amount:</strong> ${formatINR(invoice.totalAmount)}</p>
        ${invoiceUrl ? `<p><a href="${invoiceUrl}" style="display:inline-block;background:#5a1372;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Download Invoice PDF</a></p>` : "<p>Please log in to your student portal to download the invoice.</p>"}
        <p style="color:#64748b;font-size:13px">Envisions Chess Academy LLP</p>
      </div>
    `,
    metadata: {
      kind: "invoice",
      invoiceId: invoice._id.toString(),
      invoiceNumber: invoice.invoiceNumber,
      studentId: invoice.student.username || invoice.student._id.toString(),
      studentObjectId: invoice.student._id.toString(),
      invoiceUrl,
      previewText: "Your academy invoice is ready.",
    },
  });
  const status = delivery.delivered ? "sent" : delivery.skipped ? "not_configured" : "failed";
  await Invoice.findByIdAndUpdate(invoice._id, {
    lastSentAt: new Date(),
    lastSentTo: invoice.student.email,
    lastEmailStatus: status,
  });
  await recordActivity({
    actor: (session.user as any).id,
    targetUser: invoice.student._id.toString(),
    type: "fees.invoice.emailed",
    label: `Sent invoice ${invoice.invoiceNumber} to ${invoice.student.email}`,
    entityType: "Invoice",
    entityId: invoice._id.toString(),
    metadata: { invoiceNumber: invoice.invoiceNumber, email: invoice.student.email, status, source: "manual_admin" },
  });
  if (delivery.delivered) {
    await Notification.create({
      user: invoice.student._id,
      type: "invoice.sent",
      title: "Invoice emailed",
      message: `${invoice.invoiceNumber} has been emailed to ${invoice.student.email}.`,
      metadata: { invoice: invoice._id.toString(), email: invoice.student.email },
    });
  }
  revalidatePath("/fees/invoices");
  redirect(`${returnPath}send=${status}`);
}

async function sendInvoiceWhatsAppTest(formData: FormData) {
  "use server";
  const session = await requireFeesAccess("invoice", "invoices");
  if (!session) throw new Error("Forbidden");
  await dbConnect();
  const invoiceId = String(formData.get("invoice") || "");
  const returnStudent = String(formData.get("studentFilter") || "");
  const returnPath = `/fees/invoices${returnStudent ? `?student=${encodeURIComponent(returnStudent)}&` : "?"}`;
  const invoice: any = await Invoice.findById(invoiceId).populate("student plan").lean();
  if (!invoice?.student?._id) redirect(`${returnPath}whatsapp=failed`);
  const invoiceUrl = await createPublicInvoiceUrl(invoice._id.toString());
  const delivery = await sendWhatsAppReminder({
    message: invoiceReminderMessage(invoice, invoiceUrl),
    templateText: invoice.student.name || "Student",
    metadata: {
      kind: "invoice_whatsapp_test",
      invoiceId: invoice._id.toString(),
      invoiceNumber: invoice.invoiceNumber,
      studentId: invoice.student.username || invoice.student._id.toString(),
      invoiceUrl,
    },
  });
  await recordActivity({
    actor: (session.user as any).id,
    targetUser: invoice.student._id.toString(),
    type: "fees.invoice.whatsapp_test_sent",
    label: `Sent WhatsApp test for invoice ${invoice.invoiceNumber}`,
    entityType: "Invoice",
    entityId: invoice._id.toString(),
    metadata: { invoiceNumber: invoice.invoiceNumber, status: whatsappStatus(delivery), source: "manual_admin" },
  });
  redirect(`${returnPath}whatsapp=${whatsappStatus(delivery)}${whatsappErrorParam(delivery)}`);
}

async function sendBulkInvoiceReminders(formData: FormData) {
  "use server";
  const session = await requireFeesAccess("invoice", "invoices");
  if (!session) throw new Error("Forbidden");
  await dbConnect();
  const mode = String(formData.get("invoiceReminderMode") || "due");
  const now = new Date();
  const filter: any = { status: { $in: ["unpaid", "overdue"] } };
  if (mode === "due") filter.dueDate = { $lte: now };
  const invoices: any[] = await Invoice.find(filter).populate("student plan").sort({ dueDate: 1 }).limit(500).lean();
  const summary: ReminderSummary = { sent: 0, failed: 0, missing: 0, skipped: 0, total: invoices.length };

  for (const invoice of invoices) {
    if (!invoice?.student?._id || !invoice.student.email) {
      summary.missing += 1;
      await Invoice.findByIdAndUpdate(invoice._id, { lastEmailStatus: "missing_email", lastSentAt: new Date(), lastSentTo: "" });
      continue;
    }
    const invoiceUrl = await createPublicInvoiceUrl(invoice._id.toString());
    const delivery = await sendAutomationEmail({
      to: invoice.student.email,
      subject: `Reminder: Invoice ${invoice.invoiceNumber} is pending`,
      message: invoiceReminderMessage(invoice, invoiceUrl),
      metadata: {
        kind: "invoice_reminder",
        invoiceId: invoice._id.toString(),
        invoiceNumber: invoice.invoiceNumber,
        studentId: invoice.student.username || invoice.student._id.toString(),
        studentObjectId: invoice.student._id.toString(),
        invoiceUrl,
        reminderMode: mode,
        previewText: "A fee invoice reminder from Envision Chess Academy.",
      },
    });
    const status = deliveryStatus(delivery);
    if (status === "sent") summary.sent += 1;
    else if (status === "not_configured") summary.skipped += 1;
    else summary.failed += 1;
    await Invoice.findByIdAndUpdate(invoice._id, {
      lastSentAt: new Date(),
      lastSentTo: invoice.student.email,
      lastEmailStatus: status,
    });
    if (status === "sent") {
      await Notification.create({
        user: invoice.student._id,
        type: "invoice.reminder",
        title: "Invoice payment reminder",
        message: `${invoice.invoiceNumber} reminder has been emailed to ${invoice.student.email}.`,
        metadata: { invoice: invoice._id.toString(), email: invoice.student.email },
      });
    }
  }

  revalidatePath("/fees/invoices");
  await recordActivity({
    actor: (session.user as any).id,
    type: "fees.invoice.bulk_reminders_sent",
    label: `Sent bulk invoice reminders to ${summary.total} invoice${summary.total === 1 ? "" : "s"}`,
    entityType: "Invoice",
    metadata: { ...summary, mode, source: "manual_admin" },
  });
  bulkReminderRedirect(summary);
}

function queryValue(params: Record<string, string | string[] | undefined>, key: string) {
  const raw = params[key];
  return typeof raw === "string" ? raw : "";
}

function statusTone(status: string) {
  if (status === "paid") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "cancelled") return "bg-rose-50 text-rose-700 ring-rose-200";
  if (status === "overdue") return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function emailStatusCopy(status?: string) {
  if (status === "sent") return "Emailed";
  if (status === "not_configured") return "Email not configured";
  if (status === "missing_email") return "No student email";
  if (status === "failed") return "Email failed";
  if (status === "skipped") return "Email skipped";
  return "Not emailed";
}

function sendBanner(status: string) {
  if (status === "sent") return { tone: "border-emerald-200 bg-emerald-50 text-emerald-800", icon: CheckCircle2, text: "Invoice email sent to the student." };
  if (status === "not_configured") return { tone: "border-amber-200 bg-amber-50 text-amber-800", icon: MailWarning, text: "Invoice was not emailed because EMAIL_AUTOMATION_WEBHOOK_URL is not configured." };
  if (status === "missing_email") return { tone: "border-amber-200 bg-amber-50 text-amber-800", icon: MailWarning, text: "Invoice was not emailed because the student does not have an email address." };
  if (status === "failed") return { tone: "border-rose-200 bg-rose-50 text-rose-800", icon: AlertCircle, text: "Invoice email failed. Please check the email automation webhook." };
  return null;
}

function whatsappBanner(status: string, error = "") {
  if (status === "sent") return { tone: "border-emerald-200 bg-emerald-50 text-emerald-800", icon: MessageCircle, text: "WhatsApp test reminder sent to the configured test number." };
  if (status === "not_configured") return { tone: "border-amber-200 bg-amber-50 text-amber-800", icon: MailWarning, text: "WhatsApp test was not sent because WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, or WHATSAPP_TEST_RECIPIENT is missing." };
  if (status === "failed") return { tone: "border-rose-200 bg-rose-50 text-rose-800", icon: AlertCircle, text: error ? `WhatsApp test failed: ${error}` : "WhatsApp test failed. Check the Meta token, phone number ID, template name, and recipient allowlist." };
  return null;
}

function bulkBanner(params: Record<string, string | string[] | undefined>) {
  if (queryValue(params, "bulk") !== "invoice_reminders") return null;
  const sent = queryValue(params, "sent") || "0";
  const failed = queryValue(params, "failed") || "0";
  const missing = queryValue(params, "missing") || "0";
  const skipped = queryValue(params, "skipped") || "0";
  const total = queryValue(params, "total") || "0";
  const hasProblems = Number(failed) || Number(missing) || Number(skipped);
  return {
    tone: hasProblems ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-800",
    icon: hasProblems ? MailWarning : MailCheck,
    text: `Invoice reminders processed: ${sent} sent, ${failed} failed, ${missing} missing email, ${skipped} not configured, ${total} total.`,
  };
}

function invoiceTypeLabel(type: string) {
  if (type === "credits") return "Credit Plan Invoice";
  if (type === "monthly") return "Monthly Plan Invoice";
  return "Custom Invoice";
}

function invoiceModeLabel(mode: string) {
  if (mode === "included") return "GST Included";
  if (mode === "excluded") return "GST Excluded";
  return "Non-GST";
}

function MiniMetric({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
        <span className="text-brand">{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-xl font-bold text-slate-950">{value}</div>
    </div>
  );
}

export default async function FeeInvoicesPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;
  if (!userId) redirect("/login");
  const permissions = await getFeaturePermissionState("fees", session!.user as any, ["view", "invoice", "edit", "payment", "credit", "export"]);
  if (!permissions.view) redirect("/dashboard");
  const manager = isFeesManager(role);
  await dbConnect();
  await ensureMonthlyInvoices();
  const params = searchParams ? await searchParams : {};
  const selectedStudent = queryValue(params, "student");
  const invoiceFilter = manager
    ? selectedStudent ? { student: selectedStudent } : {}
    : { student: userId };
  const [invoices, students, plans, assignments] = await Promise.all([
    Invoice.find(invoiceFilter).populate("student plan").sort({ createdAt: -1 }).limit(300).lean(),
    manager ? User.find({ role: "student" }, { passwordHash: 0 }).sort({ name: 1 }).lean() : Promise.resolve([]),
    manager ? FeePlan.find({ isActive: true }).sort({ name: 1 }).lean() : Promise.resolve([]),
    manager ? FeeAssignment.find({}).lean() : Promise.resolve([]),
  ]);
  const sendStatus = queryValue(params, "send");
  const banner = sendBanner(sendStatus);
  const reminderBanner = bulkBanner(params);
  const waBanner = whatsappBanner(queryValue(params, "whatsapp"), queryValue(params, "waError"));
  const paidCount = invoices.filter((invoice: any) => invoice.status === "paid").length;
  const unpaidCount = invoices.filter((invoice: any) => invoice.status === "unpaid" || invoice.status === "overdue").length;
  const totalValue = invoices.reduce((sum: number, invoice: any) => sum + Number(invoice.totalAmount || 0), 0);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
      <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-brand/10 text-brand"><Receipt size={18} /></span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand/70">Billing workspace</p>
              <h1 className="text-xl font-bold text-slate-950">Fee Invoices</h1>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <MiniMetric label="Total Value" value={formatINR(totalValue)} icon={<IndianRupee size={15} />} />
            <MiniMetric label="Unpaid" value={unpaidCount} icon={<Clock3 size={15} />} />
            <MiniMetric label="Paid" value={paidCount} icon={<CheckCircle2 size={15} />} />
          </div>
        </div>
      </section>

      {banner && (
        <div className={`mb-4 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-semibold ${banner.tone}`}>
          <banner.icon size={18} />
          {banner.text}
        </div>
      )}
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

      {permissions.invoice && (
        <>
        <section className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-bold text-amber-950">Bulk Invoice Email Reminders</h2>
              <p className="mt-1 text-xs leading-5 text-amber-800">Send reminders through the active workflow.</p>
            </div>
            <form action={sendBulkInvoiceReminders} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select name="invoiceReminderMode" defaultValue="due" className="h-11 rounded-lg border border-amber-300 bg-white px-3 text-sm font-semibold text-slate-800">
                <option value="due">Due or overdue invoices</option>
                <option value="pending">All pending invoices</option>
              </select>
              <button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-bold text-white shadow-sm hover:bg-brand-700">
                <Send size={16} /> Send Reminders
              </button>
            </form>
          </div>
        </section>
        <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-950">Create Manual Invoice</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">Use this when you need a manual invoice.</p>
            </div>
            <span className="hidden rounded-full bg-brand/10 px-3 py-1 text-xs font-bold text-brand sm:inline-flex">4-step flow</span>
          </div>
          <InvoiceCreationForm
            action={createManualInvoice}
            students={students.map((student: any) => ({ id: student._id.toString(), name: student.name }))}
            plans={plans.map((plan: any) => ({ id: plan._id.toString(), name: plan.name, type: plan.type, amount: plan.amount, credits: plan.credits || 0, gstMode: plan.gstMode || "non_gst", gstPercentage: plan.gstPercentage || 0 }))}
            assignments={assignments.map((assignment: any) => ({ studentId: assignment.student?.toString(), planId: assignment.plan?.toString() }))}
          />
        </section>
        </>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-950">Invoice List</h2>
            <p className="mt-1 text-sm text-slate-500">{invoices.length} invoices in the current view.</p>
          </div>
          {manager && (
            <form className="flex min-w-[260px] items-center gap-2">
              <select name="student" defaultValue={selectedStudent} className="input h-10">
                <option value="">All students</option>
                {students.map((student: any) => <option key={student._id.toString()} value={student._id.toString()}>{student.name}{student.username ? ` (${student.username})` : ""}</option>)}
              </select>
              <button className="btn-primary h-10">Filter</button>
            </form>
          )}
        </div>

        {invoices.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-white text-brand shadow-sm"><FileText size={22} /></div>
            <h3 className="mt-4 text-sm font-bold text-slate-950">No invoices found</h3>
            <p className="mt-1 text-sm text-slate-500">Invoices generated through portal payments or manual invoice creation will appear here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {invoices.map((invoice: any) => {
              const invoiceId = invoice._id.toString();
              const pdfHref = `/api/fees/invoices/${invoiceId}/pdf`;
              const emailStatus = String(invoice.lastEmailStatus || "");
              return (
                <article key={invoiceId} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-brand/20 hover:bg-slate-50">
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-950">{invoice.invoiceNumber}</h3>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${statusTone(invoice.status)}`}>{invoice.status}</span>
                        <span className="rounded-full bg-brand/10 px-2.5 py-1 text-xs font-bold text-brand">{invoiceTypeLabel(invoice.type)}</span>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{invoice.title}</p>
                      <div className="mt-3 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                        {manager && (
                          <div>
                            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Student</div>
                            <div className="mt-1 font-semibold text-slate-950">{invoice.student?.name || "-"}</div>
                            <div className="text-xs text-slate-500">{invoice.student?.username || invoice.student?.email || "-"}</div>
                          </div>
                        )}
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Plan</div>
                          <div className="mt-1 font-semibold text-slate-950">{invoice.plan?.name || "-"}</div>
                          <div className="text-xs text-slate-500">{invoiceModeLabel(invoice.invoiceMode)}</div>
                        </div>
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Dates</div>
                          <div className="mt-1 text-slate-700">Issued {new Date(invoice.issueDate || invoice.createdAt).toLocaleDateString("en-IN")}</div>
                          <div className="text-slate-700">Due {new Date(invoice.dueDate).toLocaleDateString("en-IN")}</div>
                          {invoice.referenceNumber && <div className="text-xs font-semibold text-slate-500">Ref {invoice.referenceNumber}</div>}
                        </div>
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Email</div>
                          <div className="mt-1 flex items-center gap-1.5 font-semibold text-slate-950">
                            {emailStatus === "sent" ? <MailCheck size={15} className="text-emerald-600" /> : <MailWarning size={15} className="text-amber-600" />}
                            {emailStatusCopy(emailStatus)}
                          </div>
                          {invoice.lastSentAt && <div className="text-xs text-slate-500">{new Date(invoice.lastSentAt).toLocaleString("en-IN")}</div>}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg bg-slate-50 p-3">
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Total</div>
                          <div className="mt-1 text-xl font-bold text-slate-950">{formatINR(invoice.totalAmount)}</div>
                        </div>
                        <div className="text-right text-xs text-slate-500">
                          GST {invoice.invoiceMode === "non_gst" ? "-" : formatINR(invoice.gstAmount || 0)}
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <a href={pdfHref} target="_blank" className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:text-brand">View</a>
                        <a href={pdfHref} className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:text-brand"><Download size={14} /> PDF</a>
                        <a href={pdfHref} target="_blank" className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:text-brand"><Printer size={14} /> Print</a>
                        {!manager && invoice.status !== "paid" && <PayButton amount={invoice.totalAmount} purpose="invoice" refId={invoiceId} label="Pay" />}
                      </div>
                    </div>
                  </div>

                  {manager && (permissions.invoice || permissions.payment || permissions.edit) && (
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-3">
                      {permissions.invoice && <form action={sendInvoiceToStudent}>
                          <input type="hidden" name="invoice" value={invoiceId} />
                          <input type="hidden" name="studentFilter" value={selectedStudent} />
                          <button className="inline-flex h-9 items-center gap-1 rounded-lg bg-brand px-3 text-xs font-bold text-white shadow-sm hover:bg-brand-700"><Send size={14} /> Send to Student</button>
                        </form>}
                      {permissions.invoice && <form action={sendInvoiceWhatsAppTest}>
                          <input type="hidden" name="invoice" value={invoiceId} />
                          <input type="hidden" name="studentFilter" value={selectedStudent} />
                          <button className="inline-flex h-9 items-center gap-1 rounded-lg border border-emerald-200 px-3 text-xs font-bold text-emerald-700"><MessageCircle size={14} /> WhatsApp Test</button>
                        </form>}
                      {permissions.invoice && <button disabled title="Parent profile is not linked yet" className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-400">Send to Parent</button>}
                      {permissions.payment && (invoice.type !== "credits" || permissions.credit) && invoice.status !== "paid" && invoice.status !== "cancelled" && (
                        <form action={markInvoicePaid}><input type="hidden" name="invoice" value={invoiceId} /><button className="inline-flex h-9 items-center gap-1 rounded-lg border border-emerald-200 px-3 text-xs font-bold text-emerald-700"><CheckCircle2 size={14} /> Mark Paid</button></form>
                      )}
                      {permissions.edit && invoice.status !== "cancelled" && (
                        <form action={cancelInvoice}><input type="hidden" name="invoice" value={invoiceId} /><button className="inline-flex h-9 items-center gap-1 rounded-lg border border-amber-200 px-3 text-xs font-bold text-amber-700"><XCircle size={14} /> Cancel</button></form>
                      )}
                      {permissions.edit && (invoice.type !== "credits" || invoice.status !== "paid" || permissions.credit) && <form action={deleteInvoice}><input type="hidden" name="invoice" value={invoiceId} /><button className="inline-flex h-9 items-center gap-1 rounded-lg border border-rose-200 px-3 text-xs font-bold text-rose-700"><Trash2 size={14} /> Delete</button></form>}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
