import { auth } from "@/lib/auth";
import { resolvePublicAppUrl } from "@/lib/appUrl";
import { dbConnect } from "@/lib/db";
import { adjustedInvoicePayment, createInvoice, createNextMonthlyInvoiceAfterPayment, ensureMonthlyInvoices, markInvoicePaid as applyInvoicePayment } from "@/lib/fees";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { sendWhatsAppReminder } from "@/lib/whatsappAutomation";
import { formatINR } from "@/lib/utils";
import { CreditLedger, DeletedInvoice, FeeAssignment, FeePlan, Invoice, Notification } from "@/models/Fee";
import { Payment } from "@/models/Payment";
import { User } from "@/models/User";
import { createHash, randomBytes } from "crypto";
import PayButton from "@/components/PayButton";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Download, Eye, FileText, IndianRupee, MailCheck, MailWarning, MessageCircle, Printer, Receipt, Send, XCircle } from "lucide-react";
import { InvoiceCreationForm } from "@/components/fees/InvoiceCreationForm";
import { InvoicePaymentModal } from "@/components/fees/InvoicePaymentModal";
import { DeleteInvoiceButton } from "@/components/fees/DeleteInvoiceButton";
import { UpdateIssueDateButton } from "@/components/fees/UpdateIssueDateButton";
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
  const returnStudent = String(formData.get("studentFilter") || "");
  const returnPath = `/fees/invoices${returnStudent ? `?student=${encodeURIComponent(returnStudent)}&` : "?"}`;
  const invoice: any = await Invoice.findById(invoiceId).select("type amount lateFee totalAmount invoiceMode gstPercentage").lean();
  if (invoice?.type === "credits" && !(await canAccessFeature("invoices", session.user as any, "credit"))) {
    throw new Error("Forbidden");
  }
  const modes = formData.getAll("paymentMode").map((value) => String(value || "other"));
  const amounts = formData.getAll("paymentAmount").map((value) => paise(value));
  const dates = formData.getAll("paymentDate").map((value) => new Date(String(value || "")));
  const refs = formData.getAll("paymentReference").map((value) => String(value || "").trim());
  const transactions = amounts
    .map((amount, index) => ({
      mode: modes[index] === "upi" || modes[index] === "bank_transfer" ? modes[index] as "upi" | "bank_transfer" : "other" as const,
      amount,
      paidAt: dates[index] && !Number.isNaN(dates[index].getTime()) ? dates[index] : new Date(),
      referenceNumber: refs[index] || undefined,
    }))
    .filter((transaction) => transaction.amount > 0);
  const waiveLateFee = String(formData.get("waiveLateFee") || "") === "on";
  const discountAmount = paise(formData.get("discountAmount"));
  const adjustmentNote = String(formData.get("paymentAdjustmentNote") || "").trim();
  const adjusted = adjustedInvoicePayment({
    amount: Number(invoice?.amount || 0),
    lateFee: Number(invoice?.lateFee || 0),
    totalAmount: Number(invoice?.totalAmount || 0),
    invoiceMode: invoice?.invoiceMode || "non_gst",
    gstPercentage: Number(invoice?.gstPercentage || 0),
  }, { waiveLateFee, discountAmount, note: adjustmentNote });
  const totalPaid = transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  if (!transactions.length || totalPaid !== Number(adjusted.totalAmount || 0)) {
    redirect(`${returnPath}payment=amount-mismatch`);
  }
  await applyInvoicePayment(invoiceId, undefined, { actor: (session.user as any).id, source: "manual_admin" }, transactions, { waiveLateFee, discountAmount, note: adjustmentNote });
  if (invoice?.type === "monthly") await createNextMonthlyInvoiceAfterPayment(invoiceId);
  const paidInvoice: any = await Invoice.findById(invoiceId).populate("student").lean();
  if (paidInvoice?.student?._id) {
    const transactionSummary = transactions
      .map((transaction) => `${formatINR(transaction.amount)} by ${transaction.mode === "bank_transfer" ? "Bank Transfer" : transaction.mode.toUpperCase()}${transaction.referenceNumber ? `, ref ${transaction.referenceNumber}` : ""}`)
      .join("\n");
    const message = [
      `Hello ${paidInvoice.student.name},`,
      `Payment has been recorded for invoice ${paidInvoice.invoiceNumber}.`,
      `Amount: ${formatINR(paidInvoice.totalAmount)}.`,
      paidInvoice.lateFeeWaivedAmount ? `Late fee waived: ${formatINR(paidInvoice.lateFeeWaivedAmount)}.` : "",
      paidInvoice.discountAmount ? `Discount applied: ${formatINR(paidInvoice.discountAmount)}.` : "",
      transactionSummary ? `Transactions:\n${transactionSummary}` : "",
    ].filter(Boolean).join("\n\n");
    await Notification.create({
      user: paidInvoice.student._id,
      type: "invoice.paid",
      title: "Invoice marked paid",
      message: `${paidInvoice.invoiceNumber} has been marked as paid.`,
      metadata: { invoice: paidInvoice._id.toString(), transactionCount: transactions.length },
    });
    if (paidInvoice.student.email) {
      await sendAutomationEmail({
        to: paidInvoice.student.email,
        subject: `Payment received for ${paidInvoice.invoiceNumber}`,
        message,
        metadata: { kind: "invoice_paid", invoiceId, invoiceNumber: paidInvoice.invoiceNumber },
      });
    }
    if (paidInvoice.student.parentEmail) {
      await sendAutomationEmail({
        to: paidInvoice.student.parentEmail,
        subject: `Payment recorded for ${paidInvoice.student.name}`,
        message: message.replace(`Hello ${paidInvoice.student.name},`, `Hello ${paidInvoice.student.parentName || "Parent"},`),
        metadata: { kind: "invoice_paid_parent", invoiceId, invoiceNumber: paidInvoice.invoiceNumber },
      });
    }
  }
  revalidatePath("/fees/invoices");
  revalidatePath("/fees/student-fees");
  revalidatePath("/fees");
  redirect(`${returnPath}payment=paid`);
}

async function updateInvoiceIssueDate(formData: FormData) {
  "use server";
  const session = await requireFeesAccess("edit", "invoices");
  if (!session) throw new Error("Forbidden");
  await dbConnect();
  const invoiceId = String(formData.get("invoice") || "");
  const returnStudent = String(formData.get("studentFilter") || "");
  const returnPath = `/fees/invoices${returnStudent ? `?student=${encodeURIComponent(returnStudent)}&` : "?"}`;
  const issueDateValue = String(formData.get("issueDate") || "");
  const issueDate = issueDateValue ? new Date(issueDateValue) : null;
  if (!invoiceId || !issueDate || Number.isNaN(issueDate.getTime())) {
    redirect(`${returnPath}issueDate=invalid`);
  }
  issueDate.setHours(0, 0, 0, 0);
  const invoice: any = await Invoice.findByIdAndUpdate(invoiceId, { issueDate }, { new: true }).lean();
  if (!invoice) redirect(`${returnPath}issueDate=missing`);
  await recordActivity({
    actor: (session.user as any).id,
    targetUser: invoice.student?.toString?.() || String(invoice.student || ""),
    type: "fees.invoice.issue_date_updated",
    label: `Updated issue date for ${invoice.invoiceNumber}`,
    entityType: "Invoice",
    entityId: invoice._id.toString(),
    metadata: {
      invoiceNumber: invoice.invoiceNumber,
      issueDate,
      dueDate: invoice.dueDate || "",
      source: "manual_admin",
    },
  });
  revalidatePath("/fees/invoices");
  revalidatePath("/fees");
  redirect(`${returnPath}issueDate=updated`);
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
  const returnStudent = String(formData.get("studentFilter") || "");
  const returnPath = `/fees/invoices${returnStudent ? `?student=${encodeURIComponent(returnStudent)}&` : "?"}`;
  const deleteReason = String(formData.get("deleteReason") || "").trim();
  if (deleteReason.length < 3) redirect(`${returnPath}delete=reason-required`);
  const invoice: any = await Invoice.findById(invoiceId).populate("student plan").lean();
  if (!invoice) redirect(`${returnPath}delete=missing`);
  if (invoice.type === "credits" && invoice.status === "paid" && !(await canAccessFeature("invoices", session.user as any, "credit"))) {
    throw new Error("Forbidden");
  }
  let creditReversal: Record<string, unknown> = {};
  if (invoice.type === "credits" && invoice.status === "paid" && invoice.credits) {
    const studentId = invoice.student?._id || invoice.student;
    const assignment: any = await FeeAssignment.findOne({ student: studentId, type: "credits" });
    if (assignment) {
      const previousBalance = Number(assignment.creditBalance || 0);
      const previousPurchased = Number(assignment.totalCreditsPurchased || 0);
      const reversedCredits = Number(invoice.credits || 0);
      await FeeAssignment.findByIdAndUpdate(assignment._id, {
        creditBalance: Math.max(0, previousBalance - reversedCredits),
        totalCreditsPurchased: Math.max(0, previousPurchased - reversedCredits),
      });
      creditReversal = {
        assignment: assignment._id.toString(),
        reversedCredits,
        previousBalance,
        balanceAfter: Math.max(0, previousBalance - reversedCredits),
        previousPurchased,
        purchasedAfter: Math.max(0, previousPurchased - reversedCredits),
      };
    }
  }
  if (invoice.type === "monthly" && invoice.assignment && invoice.dueDate) {
    await FeeAssignment.findByIdAndUpdate(invoice.assignment, {
      $addToSet: { deletedMonthlyDueDates: new Date(invoice.dueDate) },
    });
  }
  await Payment.deleteMany({ purpose: "invoice", refId: invoice._id }).catch(() => null);
  const actor: any = await User.findById((session.user as any).id).select("name role").lean();
  await DeletedInvoice.create({
    originalInvoiceId: invoice._id,
    invoiceNumber: invoice.invoiceNumber,
    referenceNumber: invoice.referenceNumber,
    student: invoice.student?._id || invoice.student,
    studentName: invoice.student?.name || "",
    studentEmail: invoice.student?.email || "",
    studentUsername: invoice.student?.username || "",
    plan: invoice.plan?._id || invoice.plan,
    planName: invoice.plan?.name || "",
    assignment: invoice.assignment,
    type: invoice.type,
    title: invoice.title,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    amount: invoice.amount,
    totalAmount: invoice.totalAmount,
    credits: invoice.credits || 0,
    status: invoice.status,
    paidAt: invoice.paidAt,
    paymentTransactions: invoice.paymentTransactions || [],
    deletionReason: deleteReason,
    deletedBy: (session.user as any).id,
    deletedByName: actor?.name || (session.user as any).name || "",
    deletedByRole: actor?.role || (session.user as any).role || "",
    deletedAt: new Date(),
    creditReversal,
    invoiceSnapshot: invoice,
  });
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
      deleteReason,
      creditReversal,
      source: "manual_admin",
    },
  });
  revalidatePath("/fees/invoices");
  revalidatePath("/fees/student-fees");
  revalidatePath("/fees");
  redirect(`${returnPath}delete=deleted`);
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
  const parentEmail = String(invoice.student.parentEmail || "").trim();
  const parentDelivery = parentEmail
    ? await sendAutomationEmail({
        to: parentEmail,
        subject: `Invoice ${invoice.invoiceNumber} for ${invoice.student.name}`,
        message: [
          `Hello ${invoice.student.parentName || "Parent"},`,
          `Invoice ${invoice.invoiceNumber} for ${invoice.student.name} is now available.`,
          `Total amount: ${formatINR(invoice.totalAmount)}.`,
          invoiceUrl ? `Download invoice: ${invoiceUrl}` : "Please ask the student to log in to the portal to download the invoice.",
        ].join("\n\n"),
        metadata: {
          kind: "invoice_parent",
          invoiceId: invoice._id.toString(),
          invoiceNumber: invoice.invoiceNumber,
          studentObjectId: invoice.student._id.toString(),
          invoiceUrl,
          previewText: "A student fee invoice is ready.",
        },
      })
    : null;
  const status = delivery.delivered ? "sent" : delivery.skipped ? "not_configured" : "failed";
  const finalStatus = status === "sent" && parentDelivery?.delivered ? "sent_with_parent" : status;
  await Invoice.findByIdAndUpdate(invoice._id, {
    lastSentAt: new Date(),
    lastSentTo: parentDelivery?.delivered ? `${invoice.student.email}, ${parentEmail}` : invoice.student.email,
    lastEmailStatus: status,
  });
  await recordActivity({
    actor: (session.user as any).id,
    targetUser: invoice.student._id.toString(),
    type: "fees.invoice.emailed",
    label: `Sent invoice ${invoice.invoiceNumber} to ${invoice.student.email}`,
    entityType: "Invoice",
    entityId: invoice._id.toString(),
    metadata: { invoiceNumber: invoice.invoiceNumber, email: invoice.student.email, parentEmail, status: finalStatus, source: "manual_admin" },
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
  redirect(`${returnPath}send=${finalStatus}`);
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
  if (status === "sent_with_parent") return { tone: "border-emerald-200 bg-emerald-50 text-emerald-800", icon: CheckCircle2, text: "Invoice email sent to the student and parent." };
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

function paymentBanner(status: string) {
  if (status === "paid") return { tone: "border-emerald-200 bg-emerald-50 text-emerald-800", icon: CheckCircle2, text: "Invoice marked as paid successfully." };
  if (status === "amount-mismatch") return { tone: "border-rose-200 bg-rose-50 text-rose-800", icon: AlertCircle, text: "Payment transactions must exactly match the invoice amount." };
  return null;
}

function deleteBanner(status: string) {
  if (status === "deleted") return { tone: "border-emerald-200 bg-emerald-50 text-emerald-800", icon: CheckCircle2, text: "Invoice deleted successfully." };
  if (status === "missing") return { tone: "border-amber-200 bg-amber-50 text-amber-900", icon: MailWarning, text: "That invoice was already removed." };
  if (status === "reason-required") return { tone: "border-rose-200 bg-rose-50 text-rose-800", icon: AlertCircle, text: "Please enter a reason before deleting an invoice." };
  return null;
}

function issueDateBanner(status: string) {
  if (status === "updated") return { tone: "border-emerald-200 bg-emerald-50 text-emerald-800", icon: CheckCircle2, text: "Invoice issue date updated successfully." };
  if (status === "invalid") return { tone: "border-rose-200 bg-rose-50 text-rose-800", icon: AlertCircle, text: "Please enter a valid issue date." };
  if (status === "missing") return { tone: "border-amber-200 bg-amber-50 text-amber-900", icon: MailWarning, text: "That invoice could not be found." };
  return null;
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

function invoiceFilterLabel(value: string) {
  if (value === "paid") return "Paid";
  if (value === "due") return "Due";
  if (value === "upcoming") return "Upcoming";
  return "All";
}

function invoiceMatchesStatus(invoice: any, filter: string, now = new Date()) {
  if (!filter || filter === "all") return true;
  const status = String(invoice.status || "").toLowerCase();
  const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;
  if (filter === "paid") return status === "paid";
  if (filter === "due") return status !== "paid" && status !== "cancelled" && (!dueDate || dueDate.getTime() <= now.getTime() || status === "overdue");
  if (filter === "upcoming") return status !== "paid" && status !== "cancelled" && !!dueDate && dueDate.getTime() > now.getTime();
  return true;
}

function pageHref(page: number, selectedStudent: string, status: string) {
  const params = new URLSearchParams();
  if (selectedStudent) params.set("student", selectedStudent);
  if (status && status !== "all") params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/fees/invoices${query ? `?${query}` : ""}`;
}

function IconAction({
  href,
  title,
  icon,
  tone = "neutral",
  download,
}: {
  href: string;
  title: string;
  icon: React.ReactNode;
  tone?: "neutral" | "brand";
  download?: boolean;
}) {
  return (
    <a
      href={href}
      target={download ? undefined : "_blank"}
      download={download}
      title={title}
      aria-label={title}
      className={`grid h-8 w-8 place-items-center rounded-lg border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${tone === "brand" ? "border-brand/20 text-brand hover:bg-brand-50" : "border-slate-200 text-slate-600 hover:border-brand/30 hover:text-brand"}`}
    >
      {icon}
    </a>
  );
}

function MiniMetric({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
        <span className="text-brand">{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-lg font-bold text-slate-950">{value}</div>
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
  const selectedStatus = queryValue(params, "status") || "all";
  const currentPage = Math.max(1, Number(queryValue(params, "page") || 1) || 1);
  const perPage = 10;
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
  const paidBanner = paymentBanner(queryValue(params, "payment"));
  const deletedBanner = deleteBanner(queryValue(params, "delete"));
  const issueDateUpdateBanner = issueDateBanner(queryValue(params, "issueDate"));
  const waBanner = whatsappBanner(queryValue(params, "whatsapp"), queryValue(params, "waError"));
  const filteredInvoices = invoices.filter((invoice: any) => invoiceMatchesStatus(invoice, selectedStatus));
  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / perPage));
  const safePage = Math.min(currentPage, totalPages);
  const pageInvoices = filteredInvoices.slice((safePage - 1) * perPage, safePage * perPage);
  const paidCount = invoices.filter((invoice: any) => invoice.status === "paid").length;
  const dueCount = invoices.filter((invoice: any) => invoiceMatchesStatus(invoice, "due")).length;
  const upcomingCount = invoices.filter((invoice: any) => invoiceMatchesStatus(invoice, "upcoming")).length;
  const totalValue = filteredInvoices.reduce((sum: number, invoice: any) => sum + Number(invoice.totalAmount || 0), 0);

  return (
    <div className="space-y-4 text-slate-950">
      <section className="rounded-xl border border-brand/10 bg-white p-4 shadow-sm shadow-brand-900/5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-brand/10 text-brand"><Receipt size={18} /></span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand/70">Billing workspace</p>
              <h1 className="text-2xl font-semibold text-slate-950">Fee Invoices</h1>
              <p className="mt-1 text-sm text-slate-500">Create, filter, send, and reconcile invoices from one compact workspace.</p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <MiniMetric label="Total Value" value={formatINR(totalValue)} icon={<IndianRupee size={15} />} />
            <MiniMetric label="Due" value={dueCount} icon={<Clock3 size={15} />} />
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
      {paidBanner && (
        <div className={`mb-4 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-semibold ${paidBanner.tone}`}>
          <paidBanner.icon size={18} />
          {paidBanner.text}
        </div>
      )}
      {deletedBanner && (
        <div className={`mb-4 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-semibold ${deletedBanner.tone}`}>
          <deletedBanner.icon size={18} />
          {deletedBanner.text}
        </div>
      )}
      {issueDateUpdateBanner && (
        <div className={`mb-4 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-semibold ${issueDateUpdateBanner.tone}`}>
          <issueDateUpdateBanner.icon size={18} />
          {issueDateUpdateBanner.text}
        </div>
      )}
      {waBanner && (
        <div className={`mb-4 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-semibold ${waBanner.tone}`}>
          <waBanner.icon size={18} />
          {waBanner.text}
        </div>
      )}

      {permissions.invoice && (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-brand-900/5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-950">Create Manual Invoice</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">Choose a student, plan, invoice type, and due date.</p>
              </div>
              <span className="hidden rounded-full bg-brand/10 px-3 py-1 text-xs font-bold text-brand sm:inline-flex">Card flow</span>
            </div>
            <InvoiceCreationForm
              action={createManualInvoice}
              students={students.map((student: any) => ({ id: student._id.toString(), name: student.name }))}
              plans={plans.map((plan: any) => ({ id: plan._id.toString(), name: plan.name, type: plan.type, amount: plan.amount, credits: plan.credits || 0, gstMode: plan.gstMode || "non_gst", gstPercentage: plan.gstPercentage || 0 }))}
              assignments={assignments.map((assignment: any) => ({ studentId: assignment.student?.toString(), planId: assignment.plan?.toString() }))}
            />
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-amber-700 shadow-sm"><MailWarning size={17} /></span>
              <div>
                <h2 className="text-base font-semibold text-amber-950">Bulk reminders</h2>
                <p className="mt-1 text-xs leading-5 text-amber-800">Send invoice emails through the active workflow.</p>
              </div>
            </div>
            <form action={sendBulkInvoiceReminders} className="mt-4 grid gap-2">
              <select name="invoiceReminderMode" defaultValue="due" className="h-10 rounded-lg border border-amber-300 bg-white px-3 text-sm font-semibold text-slate-800">
                <option value="due">Due or overdue invoices</option>
                <option value="pending">All pending invoices</option>
              </select>
              <button className="btn-primary w-full" title="Send bulk reminders">
                <Send size={15} /> Send Reminders
              </button>
            </form>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-brand-900/5">
        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">Invoice List</h2>
            <p className="mt-1 text-sm text-slate-500">
              Showing {pageInvoices.length ? (safePage - 1) * perPage + 1 : 0}-{Math.min(safePage * perPage, filteredInvoices.length)} of {filteredInvoices.length} {invoiceFilterLabel(selectedStatus).toLowerCase()} invoices.
            </p>
          </div>
          <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_auto] xl:min-w-[680px]">
            {manager && (
              <select name="student" defaultValue={selectedStudent} className="input h-10">
                <option value="">All students</option>
                {students.map((student: any) => <option key={student._id.toString()} value={student._id.toString()}>{student.name}{student.username ? ` (${student.username})` : ""}</option>)}
              </select>
            )}
            {!manager && <input type="hidden" name="student" value={selectedStudent} />}
            <select name="status" defaultValue={selectedStatus} className="input h-10">
              <option value="all">All invoices</option>
              <option value="paid">Paid</option>
              <option value="due">Due / overdue</option>
              <option value="upcoming">Upcoming</option>
            </select>
            <button className="btn-primary h-10">Apply</button>
          </form>
        </div>

        <div className="mb-4 grid gap-2 sm:grid-cols-4">
          {[
            { id: "all", label: "All", count: invoices.length },
            { id: "due", label: "Due", count: dueCount },
            { id: "upcoming", label: "Upcoming", count: upcomingCount },
            { id: "paid", label: "Paid", count: paidCount },
          ].map((item) => (
            <a
              key={item.id}
              href={pageHref(1, selectedStudent, item.id)}
              className={`rounded-lg border px-3 py-2 text-sm transition hover:-translate-y-0.5 hover:shadow-md ${selectedStatus === item.id || (!selectedStatus && item.id === "all") ? "border-brand bg-brand-50 text-brand shadow-sm" : "border-slate-200 bg-slate-50 text-slate-700 hover:border-brand/30"}`}
            >
              <span className="font-semibold">{item.label}</span>
              <span className="float-right font-black">{item.count}</span>
            </a>
          ))}
        </div>

        {filteredInvoices.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-white text-brand shadow-sm"><FileText size={22} /></div>
            <h3 className="mt-4 text-sm font-bold text-slate-950">No invoices found</h3>
            <p className="mt-1 text-sm text-slate-500">Try a different status or student filter.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pageInvoices.map((invoice: any) => {
              const invoiceId = invoice._id.toString();
              const pdfHref = `/api/fees/invoices/${invoiceId}/pdf`;
              const emailStatus = String(invoice.lastEmailStatus || "");
              return (
                <article key={invoiceId} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md hover:shadow-brand-900/10">
                  <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-950">{invoice.invoiceNumber}</h3>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${statusTone(invoice.status)}`}>{invoice.status}</span>
                        <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand">{invoiceTypeLabel(invoice.type)}</span>
                        {Array.isArray(invoice.paymentTransactions) && invoice.paymentTransactions.length > 0 && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{invoice.paymentTransactions.length} payments</span>}
                      </div>
                      <div className="mt-1 grid gap-x-4 gap-y-1 text-xs text-slate-500 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-950">{invoice.title}</span>
                          {manager && <span className="block truncate">{invoice.student?.name || "-"} {invoice.student?.username ? `• ${invoice.student.username}` : ""}</span>}
                        </div>
                        <div className="truncate"><span className="font-semibold text-slate-700">Plan:</span> {invoice.plan?.name || "-"} • {invoiceModeLabel(invoice.invoiceMode)}</div>
                        <div><span className="font-semibold text-slate-700">Issued:</span> {new Date(invoice.issueDate || invoice.createdAt).toLocaleDateString("en-IN")} <span className="mx-1">•</span> <span className="font-semibold text-slate-700">Due:</span> {new Date(invoice.dueDate).toLocaleDateString("en-IN")}</div>
                        <div className="flex items-center gap-1.5">
                          {emailStatus === "sent" ? <MailCheck size={14} className="text-emerald-600" /> : <MailWarning size={14} className="text-amber-600" />}
                          <span>{emailStatusCopy(emailStatus)}</span>
                          {invoice.referenceNumber && <span className="truncate">• Ref {invoice.referenceNumber}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                      <div className="mr-1 min-w-28 rounded-lg bg-slate-50 px-3 py-2 text-right">
                        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Total</div>
                        <div className="text-sm font-black text-slate-950">{formatINR(invoice.totalAmount)}</div>
                      </div>
                      <IconAction href={pdfHref} title="View invoice" icon={<Eye size={14} />} tone="brand" />
                      <IconAction href={pdfHref} title="Download PDF" icon={<Download size={14} />} download />
                      <IconAction href={pdfHref} title="Print invoice" icon={<Printer size={14} />} />
                      {!manager && invoice.status !== "paid" && <PayButton amount={invoice.totalAmount} purpose="invoice" refId={invoiceId} label="Pay" />}
                      {manager && permissions.invoice && (
                        <form action={sendInvoiceToStudent}>
                          <input type="hidden" name="invoice" value={invoiceId} />
                          <input type="hidden" name="studentFilter" value={selectedStudent} />
                          <button title="Send to student" aria-label="Send invoice to student" className="grid h-8 w-8 place-items-center rounded-lg border border-brand/20 bg-brand text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-md"><Send size={14} /></button>
                        </form>
                      )}
                      {manager && permissions.invoice && (
                        <form action={sendInvoiceWhatsAppTest}>
                          <input type="hidden" name="invoice" value={invoiceId} />
                          <input type="hidden" name="studentFilter" value={selectedStudent} />
                          <button title="Send WhatsApp test" aria-label="Send WhatsApp test" className="grid h-8 w-8 place-items-center rounded-lg border border-emerald-200 bg-white text-emerald-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-50 hover:shadow-md"><MessageCircle size={14} /></button>
                        </form>
                      )}
                      {manager && permissions.edit && (
                        <UpdateIssueDateButton
                          invoiceId={invoiceId}
                          invoiceNumber={invoice.invoiceNumber || ""}
                          studentFilter={selectedStudent}
                          currentIssueDate={invoice.issueDate ? new Date(invoice.issueDate).toISOString() : invoice.createdAt ? new Date(invoice.createdAt).toISOString() : ""}
                          dueDate={invoice.dueDate ? new Date(invoice.dueDate).toISOString() : ""}
                          action={updateInvoiceIssueDate}
                        />
                      )}
                      {manager && permissions.payment && (invoice.type !== "credits" || permissions.credit) && invoice.status !== "paid" && invoice.status !== "cancelled" && (
                        <InvoicePaymentModal
                          invoiceId={invoiceId}
                          amount={invoice.amount || 0}
                          lateFee={invoice.lateFee || 0}
                          totalAmount={invoice.totalAmount || 0}
                          invoiceMode={invoice.invoiceMode || "non_gst"}
                          gstPercentage={invoice.gstPercentage || 0}
                          studentFilter={selectedStudent}
                          action={markInvoicePaid}
                        />
                      )}
                      {manager && permissions.edit && invoice.status !== "cancelled" && (
                        <form action={cancelInvoice}>
                          <input type="hidden" name="invoice" value={invoiceId} />
                          <button title="Cancel invoice" aria-label="Cancel invoice" className="grid h-8 w-8 place-items-center rounded-lg border border-amber-200 bg-white text-amber-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-amber-50 hover:shadow-md"><XCircle size={14} /></button>
                        </form>
                      )}
                      {manager && permissions.edit && (invoice.type !== "credits" || invoice.status !== "paid" || permissions.credit) && (
                        <DeleteInvoiceButton
                          invoiceId={invoiceId}
                          invoiceNumber={invoice.invoiceNumber || ""}
                          studentFilter={selectedStudent}
                          totalAmount={invoice.totalAmount || 0}
                          credits={invoice.credits || 0}
                          invoiceType={invoice.type}
                          action={deleteInvoice}
                        />
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {filteredInvoices.length > perPage && (
          <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">Page {safePage} of {totalPages}</p>
            <div className="flex items-center gap-2">
              <a
                href={pageHref(Math.max(1, safePage - 1), selectedStudent, selectedStatus)}
                aria-disabled={safePage <= 1}
                className={`grid h-9 w-9 place-items-center rounded-lg border text-slate-700 transition ${safePage <= 1 ? "pointer-events-none border-slate-200 bg-slate-50 opacity-50" : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-brand/30 hover:text-brand"}`}
              >
                <ChevronLeft size={16} />
              </a>
              {Array.from({ length: totalPages }).slice(Math.max(0, safePage - 3), Math.min(totalPages, safePage + 2)).map((_, index, pages) => {
                const first = Math.max(1, safePage - 2);
                const page = first + index;
                return (
                  <a key={page} href={pageHref(page, selectedStudent, selectedStatus)} className={`grid h-9 min-w-9 place-items-center rounded-lg border px-3 text-sm font-bold transition ${page === safePage ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-brand/30 hover:text-brand"}`}>
                    {page}
                  </a>
                );
              })}
              <a
                href={pageHref(Math.min(totalPages, safePage + 1), selectedStudent, selectedStatus)}
                aria-disabled={safePage >= totalPages}
                className={`grid h-9 w-9 place-items-center rounded-lg border text-slate-700 transition ${safePage >= totalPages ? "pointer-events-none border-slate-200 bg-slate-50 opacity-50" : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-brand/30 hover:text-brand"}`}
              >
                <ChevronRight size={16} />
              </a>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
