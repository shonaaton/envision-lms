import "server-only";

import { ACADEMY_TIME_ZONE } from "@/lib/academyTime";
import { resolvePublicAppUrl } from "@/lib/appUrl";
import { recordActivity } from "@/lib/activity";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import {
  academyCalendarDayDifference,
  creditReminderCategory,
  feeReminderWhatsAppTemplate,
  invoiceReminderCategory,
  invoiceTimingLabel,
  isCreditReminderAssignment,
  isInvoiceReminderRecord,
  reminderTypeMatches,
  resolveFeeReminderContact,
  summarizeReminderDeliveryResults,
  type FeeReminderType,
} from "@/lib/feeReminderRules";
import { createPublicInvoiceUrl } from "@/lib/fees";
import { normalizeWhatsAppRecipient } from "@/lib/whatsappAutomation";
import { sendWhatsAppAutomationTemplate } from "@/lib/whatsappAutomationEvents";
import { formatINR } from "@/lib/utils";
import { Activity } from "@/models/Activity";
import { AcademySettings, FeeAssignment, Invoice, Notification } from "@/models/Fee";

export type FeeReminderRecipient = {
  id: string;
  contextId: string;
  category: Exclude<FeeReminderType, "all_credit" | "all_invoice">;
  feeModel: "credits" | "invoice";
  studentId: string;
  studentName: string;
  parentName: string;
  contactName: string;
  planName: string;
  email: string;
  emailSource: "parent" | "student" | "missing";
  emailAvailable: boolean;
  phone: string;
  countryCode: string;
  normalizedPhone: string;
  whatsappAvailable: boolean;
  creditBalance?: number;
  invoiceId?: string;
  invoiceNumber?: string;
  invoiceAmount?: number;
  dueDate?: string;
  daysUntilDue?: number;
  timingLabel?: string;
  lastReminderAt?: string;
  lastEmailStatus?: string;
  lastWhatsAppStatus?: string;
};

export type FeeReminderChannel = "email" | "whatsapp";
export type FeeReminderDeliveryStatus = "sent" | "failed" | "unavailable" | "not_configured";
export type FeeReminderDeliveryResult = {
  recipientId: string;
  studentId: string;
  studentName: string;
  channel: FeeReminderChannel;
  status: FeeReminderDeliveryStatus;
  message?: string;
};

function formatAcademyDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: ACADEMY_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function latestDeliveryByRecipient(history: any[]) {
  const result = new Map<string, { at?: string; email?: string; whatsapp?: string }>();
  for (const entry of history) {
    const recipientId = String(entry.metadata?.recipientId || "");
    if (!recipientId) continue;
    const existing = result.get(recipientId) || {};
    const channel = String(entry.metadata?.channel || "");
    if (channel === "email" && !existing.email) existing.email = String(entry.metadata?.status || "");
    if (channel === "whatsapp" && !existing.whatsapp) existing.whatsapp = String(entry.metadata?.status || "");
    if (!existing.at) existing.at = new Date(entry.occurredAt || entry.createdAt).toISOString();
    result.set(recipientId, existing);
  }
  return result;
}

export async function getFeeReminderWorkspace(now = new Date()) {
  const [settings, creditAssignments, invoices, history] = await Promise.all([
    AcademySettings.findOne().lean(),
    FeeAssignment.find({ type: "credits" }).populate("student plan").sort({ creditBalance: 1 }).limit(1000).lean(),
    Invoice.find({ status: { $in: ["unpaid", "overdue"] }, type: { $ne: "credits" } })
      .populate("student plan assignment")
      .sort({ dueDate: 1 })
      .limit(1000)
      .lean(),
    Activity.find({ type: "fees.reminder.delivery" }).sort({ occurredAt: -1 }).limit(200).lean(),
  ]);
  const lowCreditThreshold = Math.max(0, Number((settings as any)?.lowCreditThreshold ?? 1));
  const latest = latestDeliveryByRecipient(history);
  const recipients: FeeReminderRecipient[] = [];

  for (const assignment of creditAssignments as any[]) {
    const student = assignment.student;
    if (!student?._id || student.isActive === false || student.isPaused === true || !isCreditReminderAssignment(assignment)) continue;
    const creditBalance = Number(assignment.creditBalance || 0);
    const category = creditReminderCategory(creditBalance, lowCreditThreshold);
    if (!category) continue;
    const contact = resolveFeeReminderContact(student);
    const id = `credit:${assignment._id.toString()}`;
    const last = latest.get(id);
    const normalizedPhone = normalizeWhatsAppRecipient(contact.phone, contact.countryCode);
    recipients.push({
      id,
      contextId: assignment._id.toString(),
      category,
      feeModel: "credits",
      studentId: student._id.toString(),
      studentName: contact.studentName,
      parentName: contact.parentName,
      contactName: contact.contactName,
      planName: assignment.plan?.name || "Credit plan",
      email: contact.email,
      emailSource: contact.emailSource,
      emailAvailable: Boolean(contact.email),
      phone: contact.phone,
      countryCode: contact.countryCode,
      normalizedPhone,
      whatsappAvailable: Boolean(normalizedPhone),
      creditBalance,
      lastReminderAt: last?.at || (assignment.lastCreditReminderAt ? new Date(assignment.lastCreditReminderAt).toISOString() : undefined),
      lastEmailStatus: last?.email || assignment.lastCreditReminderStatus || undefined,
      lastWhatsAppStatus: last?.whatsapp,
    });
  }

  for (const invoice of invoices as any[]) {
    const student = invoice.student;
    if (!student?._id || student.isActive === false || student.isPaused === true || !isInvoiceReminderRecord(invoice)) continue;
    const category = invoiceReminderCategory(String(invoice.status || ""), invoice.dueDate, now);
    if (!category) continue;
    const contact = resolveFeeReminderContact(student);
    const id = `invoice:${invoice._id.toString()}`;
    const last = latest.get(id);
    const normalizedPhone = normalizeWhatsAppRecipient(contact.phone, contact.countryCode);
    const daysUntilDue = academyCalendarDayDifference(invoice.dueDate, now);
    recipients.push({
      id,
      contextId: invoice._id.toString(),
      category,
      feeModel: "invoice",
      studentId: student._id.toString(),
      studentName: contact.studentName,
      parentName: contact.parentName,
      contactName: contact.contactName,
      planName: invoice.plan?.name || invoice.assignment?.plan?.name || (invoice.type === "monthly" ? "Monthly plan" : "Invoice based"),
      email: contact.email,
      emailSource: contact.emailSource,
      emailAvailable: Boolean(contact.email),
      phone: contact.phone,
      countryCode: contact.countryCode,
      normalizedPhone,
      whatsappAvailable: Boolean(normalizedPhone),
      invoiceId: invoice._id.toString(),
      invoiceNumber: invoice.invoiceNumber || "Invoice",
      invoiceAmount: Number(invoice.totalAmount || 0),
      dueDate: new Date(invoice.dueDate).toISOString(),
      daysUntilDue,
      timingLabel: invoiceTimingLabel(daysUntilDue),
      lastReminderAt: last?.at || (invoice.lastReminderAt ? new Date(invoice.lastReminderAt).toISOString() : invoice.lastSentAt ? new Date(invoice.lastSentAt).toISOString() : undefined),
      lastEmailStatus: last?.email || invoice.lastEmailStatus || undefined,
      lastWhatsAppStatus: last?.whatsapp,
    });
  }

  const counts = {
    invoice_upcoming: recipients.filter((item) => item.category === "invoice_upcoming").length,
    invoice_overdue: recipients.filter((item) => item.category === "invoice_overdue").length,
    credit_low: recipients.filter((item) => item.category === "credit_low").length,
    credit_zero: recipients.filter((item) => item.category === "credit_zero").length,
    credit_blocked: recipients.filter((item) => item.category === "credit_blocked").length,
  };

  return {
    generatedAt: now.toISOString(),
    timeZone: ACADEMY_TIME_ZONE,
    lowCreditThreshold,
    counts,
    recipients,
    history: history.slice(0, 60).map((entry: any) => ({
      id: entry._id.toString(),
      occurredAt: new Date(entry.occurredAt || entry.createdAt).toISOString(),
      studentName: entry.metadata?.studentName || "Student",
      reminderType: entry.metadata?.reminderType || "",
      channel: entry.metadata?.channel || "",
      status: entry.metadata?.status || "",
      invoiceNumber: entry.metadata?.invoiceNumber || "",
    })),
  };
}

function creditCopy(recipient: FeeReminderRecipient) {
  const balance = Number(recipient.creditBalance || 0);
  if (recipient.category === "credit_zero") {
    return {
      subject: `Final class allowance for ${recipient.studentName}`,
      message: `${recipient.studentName}'s normal class credits are exhausted. One final grace class remains available. Please recharge immediately to avoid interruption after that class.`,
      templateName: feeReminderWhatsAppTemplate(recipient.category),
      parameters: [recipient.contactName, recipient.studentName],
    };
  }
  if (recipient.category === "credit_blocked") {
    return {
      subject: `Classroom access paused for ${recipient.studentName}`,
      message: `${recipient.studentName}'s final class allowance has been consumed. Classroom joining is paused until the credit plan is recharged.`,
      templateName: feeReminderWhatsAppTemplate(recipient.category),
      parameters: [recipient.contactName, recipient.studentName],
    };
  }
  return {
    subject: `Low class credit balance for ${recipient.studentName}`,
    message: `${recipient.studentName} has ${balance} class credit${balance === 1 ? "" : "s"} remaining. Recharge is recommended before the balance is exhausted.`,
    templateName: feeReminderWhatsAppTemplate(recipient.category),
    parameters: [recipient.contactName, recipient.studentName, String(balance)],
  };
}

async function reminderContent(recipient: FeeReminderRecipient) {
  if (recipient.feeModel === "credits") {
    const copy = creditCopy(recipient);
    const baseUrl = resolvePublicAppUrl(undefined, { allowRequestHeaders: false });
    const portalUrl = baseUrl ? `${baseUrl}/fees` : "";
    return {
      ...copy,
      message: [`Hello ${recipient.contactName},`, copy.message, portalUrl ? `Billing portal: ${portalUrl}` : "Please open the academy billing portal to recharge."].join("\n\n"),
      actionUrl: portalUrl,
    };
  }
  const invoiceUrl = recipient.invoiceId ? await createPublicInvoiceUrl(recipient.invoiceId) : "";
  const dueDate = recipient.dueDate ? formatAcademyDate(recipient.dueDate) : "";
  const overdue = recipient.category === "invoice_overdue";
  return {
    subject: overdue ? `Overdue invoice: ${recipient.invoiceNumber}` : `Invoice due reminder: ${recipient.invoiceNumber}`,
    message: [
      `Hello ${recipient.contactName},`,
      `${recipient.invoiceNumber} for ${recipient.studentName} is ${overdue ? "overdue" : recipient.timingLabel?.toLowerCase()}.`,
      `Outstanding amount: ${formatINR(recipient.invoiceAmount || 0)}.`,
      `Due date: ${dueDate}.`,
      invoiceUrl ? `Invoice and payment details: ${invoiceUrl}` : "Please open the academy billing portal to review the invoice.",
    ].join("\n\n"),
    templateName: feeReminderWhatsAppTemplate(recipient.category),
    parameters: [recipient.contactName, recipient.studentName, recipient.invoiceNumber || "Invoice", formatINR(recipient.invoiceAmount || 0), dueDate, invoiceUrl || "Academy billing portal"],
    actionUrl: invoiceUrl,
  };
}

function deliveryStatus(delivery: any): FeeReminderDeliveryStatus {
  if (delivery?.delivered) return "sent";
  if (delivery?.skipped) return "not_configured";
  return "failed";
}

export function summarizeFeeReminderResults(results: FeeReminderDeliveryResult[]) {
  return summarizeReminderDeliveryResults(results);
}

async function logDelivery(actorId: string, recipient: FeeReminderRecipient, result: FeeReminderDeliveryResult) {
  await recordActivity({
    actor: actorId,
    targetUser: recipient.studentId,
    type: "fees.reminder.delivery",
    label: `${result.channel === "email" ? "Email" : "WhatsApp"} fee reminder ${result.status} for ${recipient.studentName}`,
    entityType: recipient.feeModel === "invoice" ? "Invoice" : "FeeAssignment",
    entityId: recipient.contextId,
    metadata: {
      recipientId: recipient.id,
      studentId: recipient.studentId,
      studentName: recipient.studentName,
      reminderType: recipient.category,
      channel: result.channel,
      status: result.status,
      invoiceNumber: recipient.invoiceNumber || "",
      invoiceId: recipient.invoiceId || "",
      assignmentId: recipient.feeModel === "credits" ? recipient.contextId : "",
      creditBalance: recipient.creditBalance,
      contactSource: recipient.emailSource,
      source: "manual_admin",
    },
  });
}

export async function sendFeeReminders({
  actorId,
  reminderType,
  channels,
  recipientIds,
}: {
  actorId: string;
  reminderType: FeeReminderType;
  channels: FeeReminderChannel[];
  recipientIds: string[];
}) {
  const workspace = await getFeeReminderWorkspace();
  const selected = new Set(recipientIds);
  const recipients = workspace.recipients.filter((recipient) => selected.has(recipient.id) && reminderTypeMatches(reminderType, recipient.category));
  const results: FeeReminderDeliveryResult[] = [];

  for (const recipient of recipients) {
    let contentPromise: ReturnType<typeof reminderContent> | undefined;
    const getContent = () => {
      contentPromise ||= reminderContent(recipient);
      return contentPromise;
    };
    let deliveredAny = false;
    if (channels.includes("email")) {
      let status: FeeReminderDeliveryStatus = "unavailable";
      let message = "";
      if (recipient.emailAvailable) {
        try {
          const content = await getContent();
          status = deliveryStatus(await sendAutomationEmail({
              to: recipient.email,
              subject: content.subject,
              message: content.message,
              actionUrl: content.actionUrl,
              actionLabel: recipient.feeModel === "invoice" ? "View Invoice" : "View Credits",
              metadata: { kind: recipient.feeModel === "invoice" ? "invoice_reminder" : "credit_reminder", reminderType: recipient.category, recipientId: recipient.id },
            }));
        } catch (error) {
          status = "failed";
          message = error instanceof Error ? error.message : "Email delivery failed";
        }
      }
      const result = { recipientId: recipient.id, studentId: recipient.studentId, studentName: recipient.studentName, channel: "email" as const, status, message };
      results.push(result);
      deliveredAny ||= status === "sent";
      await logDelivery(actorId, recipient, result);
      if (recipient.feeModel === "credits") {
        await FeeAssignment.findByIdAndUpdate(recipient.contextId, { lastCreditReminderAt: new Date(), lastCreditReminderTo: recipient.emailAvailable ? recipient.email : "", lastCreditReminderStatus: status === "unavailable" ? "missing_email" : status === "not_configured" ? "not_configured" : status });
      } else {
        await Invoice.findByIdAndUpdate(recipient.contextId, { lastSentAt: new Date(), lastSentTo: recipient.emailAvailable ? recipient.email : "", lastEmailStatus: status === "unavailable" ? "missing_email" : status === "not_configured" ? "not_configured" : status });
      }
    }
    if (channels.includes("whatsapp")) {
      let status: FeeReminderDeliveryStatus = "unavailable";
      let message = "";
      if (recipient.whatsappAvailable) {
        try {
          const content = await getContent();
          status = deliveryStatus(await sendWhatsAppAutomationTemplate({
              to: recipient.normalizedPhone,
              user: { _id: recipient.studentId, name: recipient.contactName, phone: recipient.phone, countryCode: recipient.countryCode, role: "student" },
              templateName: content.templateName,
              bodyParameters: content.parameters,
              metadata: { kind: "fee_reminder", reminderType: recipient.category, recipientId: recipient.id, studentId: recipient.studentId, invoiceId: recipient.invoiceId || "", invoiceNumber: recipient.invoiceNumber || "" },
            }));
        } catch (error) {
          status = "failed";
          message = error instanceof Error ? error.message : "WhatsApp delivery failed";
        }
      }
      const result = { recipientId: recipient.id, studentId: recipient.studentId, studentName: recipient.studentName, channel: "whatsapp" as const, status, message };
      results.push(result);
      deliveredAny ||= status === "sent";
      await logDelivery(actorId, recipient, result);
    }
    if (deliveredAny) {
      await Notification.create({
        user: recipient.studentId,
        type: "fees.reminder",
        title: recipient.feeModel === "invoice" ? "Invoice reminder sent" : "Credit reminder sent",
        message: recipient.feeModel === "invoice" ? `${recipient.invoiceNumber} payment reminder was sent.` : `A ${recipient.category.replaceAll("_", " ")} was sent.`,
        metadata: { recipientId: recipient.id, reminderType: recipient.category, invoice: recipient.invoiceId || undefined },
      }).catch(() => null);
    }
  }

  const summary = summarizeFeeReminderResults(results);
  await recordActivity({
    actor: actorId,
    type: "fees.reminder.bulk_processed",
    label: `Processed fee reminders for ${recipients.length} recipient${recipients.length === 1 ? "" : "s"}`,
    entityType: "FeeReminder",
    metadata: { reminderType, channels, recipients: recipients.length, summary, source: "manual_admin" },
  });
  return { processed: recipients.length, summary, results };
}
