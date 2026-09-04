import { NextResponse } from "next/server";
import { resolvePublicAppUrl } from "@/lib/appUrl";
import { dbConnect } from "@/lib/db";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { ensureMonthlyInvoices } from "@/lib/fees";
import { formatINR } from "@/lib/utils";
import { Invoice, Notification } from "@/models/Fee";
import { User } from "@/models/User";
import { sendInvoiceOverdueEscalationEmail } from "@/lib/studentCommunicationEmails";
import { importantContactWhatsAppRecipientsByKeys } from "@/lib/importantContacts";
import { sendWhatsAppAutomationTemplate, sendWhatsAppAutomationTemplates } from "@/lib/whatsappAutomationEvents";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function daysUntil(dueDate: Date, now: Date) {
  return Math.round((startOfDay(dueDate).getTime() - startOfDay(now).getTime()) / DAY);
}

function reminderKind(days: number) {
  if (days === 3) return "three_days";
  if (days === 0) return "due_today";
  if (days < 0 && days >= -7) return `overdue_${Math.abs(days)}`;
  return "";
}

function studentMessage(invoice: any, invoiceUrl: string, days: number) {
  const dueText = new Date(invoice.dueDate).toLocaleDateString("en-IN");
  const timing = days > 0 ? `due in ${days} days` : days === 0 ? "due today" : `overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`;
  return [
    `Hello ${invoice.student.name},`,
    `Invoice ${invoice.invoiceNumber} for ${invoice.title} is ${timing}.`,
    `Amount: ${formatINR(invoice.totalAmount)}.`,
    `Due date: ${dueText}.`,
    invoiceUrl ? `Download invoice: ${invoiceUrl}` : "Please log in to the student portal to view and pay the invoice.",
  ].join("\n\n");
}

async function notifyAdmins(invoice: any, days: number, invoiceUrl: string) {
  if (days !== 3 && days !== 0) return 0;
  const admins: any[] = await User.find({ role: { $in: ["admin", "sub-admin"] }, isActive: { $ne: false } }).select("_id name email phone role").lean();
  const timing = days === 3 ? "is due in 3 days" : "is due today";
  await Notification.insertMany(admins.map((admin) => ({
    user: admin._id,
    type: "invoice.monthly_due_admin",
    title: "Monthly invoice due",
    message: `${invoice.invoiceNumber} for ${invoice.student.name} ${timing}.`,
    metadata: { invoice: invoice._id.toString(), student: invoice.student._id.toString(), days, href: "/fees/invoices" },
  })), { ordered: false }).catch(() => null);
  for (const admin of admins) {
    if (admin.email) {
      await sendAutomationEmail({
        to: admin.email,
        subject: `Monthly invoice ${timing}: ${invoice.student.name}`,
        message: [
          `Hello ${admin.name || "Admin"},`,
          `Invoice ${invoice.invoiceNumber} for ${invoice.student.name} ${timing}.`,
          `Amount: ${formatINR(invoice.totalAmount)}.`,
          invoiceUrl ? `Invoice link: ${invoiceUrl}` : "Open the Fees > Invoices page to review it.",
        ].join("\n\n"),
        metadata: { kind: "monthly_invoice_admin_reminder", invoiceId: invoice._id.toString(), days },
      });
    }
  }
  const whatsappAdmins = days === 0
    ? importantContactWhatsAppRecipientsByKeys(["saptarshi"])
    : admins;
  await sendWhatsAppAutomationTemplates(whatsappAdmins.map((admin) => ({
    user: admin,
    templateName: days === 0 ? "invoice_due_today" : "invoice_due_admin_alert",
    bodyParameters: days === 0
      ? [
          admin.name || "Admin",
          invoice.invoiceNumber,
          invoice.student.name || invoice.title || "Student",
          new Date(invoice.dueDate).toLocaleDateString("en-IN"),
          formatINR(invoice.totalAmount),
        ]
      : [admin.name || "Admin", invoice.invoiceNumber, invoice.student.name || "Student", timing, formatINR(invoice.totalAmount)],
      metadata: { kind: "monthly_invoice_admin_reminder", invoiceId: invoice._id.toString(), days, href: "/fees/invoices" },
  })));
  return admins.length;
}

async function notifyOverdueInvoiceStaff(invoice: any, days: number) {
  if (days >= 0) return 0;
  const recipients = importantContactWhatsAppRecipientsByKeys(["sayan_bose", "saptarshi"]);
  await sendWhatsAppAutomationTemplates(recipients.map((recipient) => ({
    user: recipient,
    templateName: "invoice_overdue_reminder",
    bodyParameters: [
      recipient.name || "Admin",
      invoice.invoiceNumber,
      invoice.student?.name || invoice.title || "Student",
      formatINR(invoice.totalAmount),
      new Date(invoice.dueDate).toLocaleDateString("en-IN"),
    ],
    metadata: {
      kind: "monthly_invoice_overdue_staff_reminder",
      invoiceId: invoice._id.toString(),
      invoiceNumber: invoice.invoiceNumber,
      days,
      href: "/fees/invoices",
      notificationDedupKey: `invoice_overdue:${invoice._id.toString()}:${Math.abs(days)}`,
    },
  })));
  return recipients.length;
}

async function processReminders(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authorization = req.headers.get("authorization") || "";
    if (authorization !== `Bearer ${secret}`) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await dbConnect();
  const now = new Date();
  await ensureMonthlyInvoices(now);
  const invoices: any[] = await Invoice.find({
    type: "monthly",
    status: { $in: ["unpaid", "overdue"] },
  }).populate("student plan").sort({ dueDate: 1 }).limit(500).lean();

  let studentNotifications = 0;
  let adminNotifications = 0;
  let skipped = 0;
  const baseUrl = resolvePublicAppUrl(req);

  for (const invoice of invoices) {
    if (!invoice.student || invoice.student.isActive === false || invoice.student.role !== "student") {
      skipped += 1;
      continue;
    }
    const days = daysUntil(new Date(invoice.dueDate), now);
    const kind = reminderKind(days);
    if (!kind) continue;
    const key = `${dateKey(now)}:${kind}`;
    if (invoice.lastReminderKey === key) continue;
    const invoiceUrl = baseUrl ? `${baseUrl}/fees/invoices?student=${invoice.student._id.toString()}` : "";

    await Notification.create({
      user: invoice.student._id,
      type: "invoice.monthly_due",
      title: days < 0 ? "Invoice overdue" : "Invoice due reminder",
      message: `${invoice.invoiceNumber} is ${days > 0 ? `due in ${days} days` : days === 0 ? "due today" : `overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`}.`,
      metadata: { invoice: invoice._id.toString(), days, href: "/fees/invoices" },
    });
    studentNotifications += 1;

    if (invoice.student.email) {
      await sendAutomationEmail({
        to: invoice.student.email,
        subject: days < 0 ? `Overdue invoice reminder: ${invoice.invoiceNumber}` : `Invoice reminder: ${invoice.invoiceNumber}`,
        message: studentMessage(invoice, invoiceUrl, days),
        metadata: { kind: "monthly_invoice_student_reminder", invoiceId: invoice._id.toString(), days },
      });
    }
    if (invoice.student.parentEmail) {
      await sendAutomationEmail({
        to: invoice.student.parentEmail,
        subject: days < 0 ? `Overdue invoice for ${invoice.student.name}` : `Invoice reminder for ${invoice.student.name}`,
        message: studentMessage(invoice, invoiceUrl, days).replace(`Hello ${invoice.student.name},`, `Hello ${invoice.student.parentName || "Parent"},`),
        metadata: { kind: "monthly_invoice_parent_reminder", invoiceId: invoice._id.toString(), days },
      });
    }
    await sendWhatsAppAutomationTemplate({
      user: invoice.student,
      templateName: days < 0 ? "invoice_overdue_reminder" : days === 0 ? "invoice_due_today" : "invoice_due_soon",
      bodyParameters: [
        invoice.student.name || "there",
        invoice.invoiceNumber,
        invoice.title || "Invoice",
        new Date(invoice.dueDate).toLocaleDateString("en-IN"),
        formatINR(invoice.totalAmount),
      ],
      metadata: { kind: "monthly_invoice_student_reminder", invoiceId: invoice._id.toString(), days, href: "/fees/invoices" },
    });
    adminNotifications += await notifyOverdueInvoiceStaff(invoice, days);
    if (days === -3 || days === -7) {
      await sendInvoiceOverdueEscalationEmail({
        invoice,
        invoiceUrl,
        daysOverdue: Math.abs(days),
      });
    }
    adminNotifications += await notifyAdmins(invoice, days, invoiceUrl);
    await Invoice.findByIdAndUpdate(invoice._id, { lastReminderKey: key, lastReminderAt: now });
  }

  return NextResponse.json({ ok: true, studentNotifications, adminNotifications, skipped });
}

export async function GET(req: Request) {
  return processReminders(req);
}

export async function POST(req: Request) {
  return processReminders(req);
}
