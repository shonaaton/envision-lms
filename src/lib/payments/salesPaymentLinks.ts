import "server-only";

import { Types } from "mongoose";
import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { createInvoice, getAcademySettings, invoiceBreakup, markInvoicePaid } from "@/lib/fees";
import { cancelPaymentLink, createPaymentLink, paymentMethodFromRazorpay, razorpayConfigured } from "@/lib/payments/razorpay";
import { canonicalPhoneNumber } from "@/lib/phoneCountryCodes";
import { collectsThroughRazorpay } from "@/lib/payments/gstAccount";
import { sendWhatsAppAutomationTemplate } from "@/lib/whatsappAutomationEvents";
import { formatINR } from "@/lib/utils";
import { FeePlan } from "@/models/Fee";
import { Payment } from "@/models/Payment";
import { SalesPaymentLink } from "@/models/SalesPaymentLink";
import { User } from "@/models/User";

export class PaymentLinkError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export type PaymentLinkActor = { id: string; name: string; seesAll: boolean };

export const createSalesLinkSchema = z.object({
  customerName: z.string().trim().min(2, "Enter the parent's name.").max(120),
  studentName: z.string().trim().max(120).optional().default(""),
  phone: z.string().trim().min(6, "Enter a WhatsApp number.").max(20),
  countryCode: z.string().trim().max(6).optional().default("+91"),
  email: z.string().trim().email("Enter a valid email.").max(160).optional().or(z.literal("")).default(""),
  feePlanId: z.string().trim().optional().default(""),
  /** Rupees, used when no plan is picked. */
  amountRupees: z.coerce.number().optional(),
  description: z.string().trim().max(200).optional().default(""),
});

/**
 * Active GST plans with the GST-inclusive total a family would pay for each.
 * Non-GST plans are left out: Razorpay pays into the GST account (user, 2026-10-27).
 */
export async function salesFeePlans() {
  await dbConnect();
  const [settings, plans] = await Promise.all([getAcademySettings(), FeePlan.find({ isActive: true }).sort({ name: 1 }).lean()]);
  return (plans as any[]).filter((plan) => collectsThroughRazorpay(plan)).map((plan) => ({
    id: String(plan._id),
    name: String(plan.name),
    type: String(plan.type),
    credits: Number(plan.credits || 0),
    total: invoiceBreakup(Number(plan.amount || 0), 0, settings, { gstMode: plan.gstMode, gstPercentage: plan.gstPercentage }).totalAmount,
  }));
}

function serialize(link: any) {
  return {
    id: String(link._id),
    customerName: link.customerName,
    studentName: link.studentName || "",
    phone: link.phone,
    countryCode: link.countryCode || "",
    email: link.email || "",
    feePlanName: link.feePlanName || "",
    amount: Number(link.amount || 0),
    description: link.description,
    createdByName: link.createdByName || "",
    shortUrl: link.shortUrl || "",
    status: link.status,
    paidAt: link.paidAt || null,
    amountPaid: Number(link.amountPaid || 0),
    method: link.method || "",
    whatsappStatus: link.whatsappStatus || "",
    attachedStudentName: link.attachedStudent?.name || "",
    attachedInvoiceNumber: link.attachedInvoice?.invoiceNumber || "",
    createdAt: link.createdAt,
  };
}

export type SalesPaymentLinkRow = ReturnType<typeof serialize>;

/** Salespeople see the links they sent; whoever can attach payments sees every link. */
export async function listSalesPaymentLinks(actor: PaymentLinkActor) {
  await dbConnect();
  const links = await SalesPaymentLink.find(actor.seesAll ? {} : { createdBy: actor.id })
    .sort({ createdAt: -1 })
    .limit(300)
    .populate("attachedStudent", "name")
    .populate("attachedInvoice", "invoiceNumber")
    .lean();
  return links.map(serialize);
}

async function findOwnLink(actor: PaymentLinkActor, id: string) {
  if (!Types.ObjectId.isValid(id)) throw new PaymentLinkError("Payment link not found.", 404);
  const link: any = await SalesPaymentLink.findById(id);
  if (!link || (!actor.seesAll && String(link.createdBy) !== actor.id)) throw new PaymentLinkError("Payment link not found.", 404);
  return link;
}

async function sendLinkOnWhatsApp(link: any) {
  const to = canonicalPhoneNumber(link.phone, link.countryCode);
  const result = await sendWhatsAppAutomationTemplate({
    to,
    templateName: "sales_payment_link",
    bodyParameters: [link.customerName, link.description, formatINR(link.amount), link.shortUrl],
    metadata: { kind: "sales_payment_link", salesLinkId: String(link._id) },
  }).catch((error) => ({ delivered: false, skipped: false, error: String(error?.message || error) }) as any);
  link.whatsappStatus = result?.delivered ? "sent" : result?.skipped ? "not_configured" : "failed";
  link.whatsappSentAt = new Date();
  await link.save();
  return link.whatsappStatus as string;
}

export async function createSalesPaymentLink(actor: PaymentLinkActor, raw: unknown) {
  if (!razorpayConfigured()) throw new PaymentLinkError("Razorpay is not configured yet. Add the Razorpay keys to the server environment.", 503);
  const input = createSalesLinkSchema.parse(raw);
  const phone = canonicalPhoneNumber(input.phone, input.countryCode);
  if (!phone || phone.length < 8) throw new PaymentLinkError("Enter a valid WhatsApp number.");
  await dbConnect();

  let amount = 0;
  let plan: any = null;
  if (input.feePlanId) {
    if (!Types.ObjectId.isValid(input.feePlanId)) throw new PaymentLinkError("Choose a valid fee plan.");
    plan = await FeePlan.findOne({ _id: input.feePlanId, isActive: true }).lean();
    if (!plan) throw new PaymentLinkError("That fee plan is no longer active.");
    if (!collectsThroughRazorpay(plan)) throw new PaymentLinkError("That is a non-GST plan, which is paid into the other account. Pick a GST plan or type the amount.");
    const settings = await getAcademySettings();
    amount = invoiceBreakup(Number(plan.amount || 0), 0, settings, { gstMode: plan.gstMode, gstPercentage: plan.gstPercentage }).totalAmount;
  } else {
    amount = Math.round(Number(input.amountRupees || 0) * 100);
  }
  if (!(amount >= 100)) throw new PaymentLinkError("The amount must be at least ₹1.");
  if (amount > 10_000_000) throw new PaymentLinkError("The amount looks too large. Check it and try again.");
  const description = input.description || plan?.name || "";
  if (description.length < 3) throw new PaymentLinkError("Say what the payment is for, or pick a fee plan.");

  const link: any = new SalesPaymentLink({
    customerName: input.customerName,
    studentName: input.studentName || undefined,
    phone: input.phone,
    countryCode: input.countryCode,
    email: input.email || undefined,
    feePlan: plan?._id,
    feePlanName: plan?.name,
    amount,
    description,
    createdBy: actor.id,
    createdByName: actor.name,
  });
  link.referenceId = `SL-${String(link._id)}`;
  try {
    const created = await createPaymentLink({
      amount,
      description: `Envision Chess Academy - ${description}${input.studentName ? ` for ${input.studentName}` : ""}`,
      referenceId: link.referenceId,
      customer: { name: input.customerName, email: input.email || undefined, contact: `+${phone}` },
      notes: { kind: "sales_link", salesLinkId: String(link._id) },
    });
    link.razorpayLinkId = created.id;
    link.shortUrl = created.shortUrl;
  } catch (error: any) {
    console.error("Sales payment link create failed", { error: error?.error || error });
    throw new PaymentLinkError(error?.error?.description || "Razorpay did not create the link. Try again in a minute.", 502);
  }
  await link.save();
  await sendLinkOnWhatsApp(link);
  await recordActivity({
    actor: actor.id,
    type: "sales.payment_link.created",
    label: `${actor.name} sent a ${formatINR(amount)} payment link to ${input.customerName}`,
    entityType: "SalesPaymentLink",
    entityId: String(link._id),
    metadata: { amount, feePlan: plan ? String(plan._id) : "", razorpayLinkId: link.razorpayLinkId, whatsappStatus: link.whatsappStatus },
  });
  return serialize(link.toObject());
}

export async function resendSalesPaymentLink(actor: PaymentLinkActor, id: string) {
  await dbConnect();
  const link = await findOwnLink(actor, id);
  if (link.status !== "created") throw new PaymentLinkError("Only an unpaid, open link can be sent again.");
  const status = await sendLinkOnWhatsApp(link);
  await recordActivity({
    actor: actor.id,
    type: "sales.payment_link.resent",
    label: `${actor.name} resent the payment link to ${link.customerName}`,
    entityType: "SalesPaymentLink",
    entityId: String(link._id),
    metadata: { whatsappStatus: status },
  });
  return serialize(link.toObject());
}

export async function cancelSalesPaymentLink(actor: PaymentLinkActor, id: string) {
  await dbConnect();
  const link = await findOwnLink(actor, id);
  if (link.status !== "created") throw new PaymentLinkError("Only an unpaid, open link can be cancelled.");
  const closed = await cancelPaymentLink(link.razorpayLinkId);
  if (closed === "paid") throw new PaymentLinkError("This link has just been paid. It will show as paid in a moment.");
  if (closed === "failed") throw new PaymentLinkError("Razorpay did not cancel the link, so it may still be payable. Try again in a minute.", 502);
  link.status = "cancelled";
  link.cancelledAt = new Date();
  link.cancelledBy = actor.id;
  await link.save();
  await recordActivity({
    actor: actor.id,
    type: "sales.payment_link.cancelled",
    label: `${actor.name} cancelled the payment link for ${link.customerName}`,
    entityType: "SalesPaymentLink",
    entityId: String(link._id),
  });
  return serialize(link.toObject());
}

/** Students an admin can attach a paid link to, matched by name, phone or email. */
export async function searchAttachableStudents(query: string) {
  const q = query.trim();
  if (q.length < 2) return [];
  await dbConnect();
  const pattern = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const digits = q.replace(/\D/g, "");
  const students = await User.find({
    role: "student",
    $or: [{ name: pattern }, { email: pattern }, { parentName: pattern }, { parentEmail: pattern }, ...(digits.length >= 5 ? [{ phone: new RegExp(digits) }] : [])],
  })
    .select("name email phone accountStatus")
    .limit(10)
    .lean();
  return (students as any[]).map((student) => ({
    id: String(student._id),
    name: student.name,
    email: student.email || "",
    phone: student.phone || "",
    accountStatus: student.accountStatus || "",
  }));
}

/**
 * Turns a paid link into the student's paid invoice, once the family has an
 * account. The invoice is GST-inclusive for exactly what was paid, so the books
 * match the money received; a credits plan adds its credits through
 * markInvoicePaid as any credits invoice does.
 */
export async function attachSalesPaymentLink(actor: PaymentLinkActor, id: string, studentId: string) {
  await dbConnect();
  const link = await findOwnLink(actor, id);
  if (link.status !== "paid") throw new PaymentLinkError("Only a paid link can be attached to a student.");
  if (link.attachedInvoice) throw new PaymentLinkError("This payment is already attached to a student.");
  if (!Types.ObjectId.isValid(studentId)) throw new PaymentLinkError("Choose a student.");
  const student: any = await User.findOne({ _id: studentId, role: "student" }).select("name").lean();
  if (!student) throw new PaymentLinkError("Choose a student.");

  const [settings, plan]: any[] = await Promise.all([getAcademySettings(), link.feePlan ? FeePlan.findById(link.feePlan).lean() : null]);
  // The money came through Razorpay, i.e. into the GST account, so the invoice
  // is always a GST invoice with GST inside the amount paid.
  const gstPercentage = [plan?.gstPercentage, settings.gstPercentage, 18].map(Number).find((value) => value > 0) as number;
  const paid = Number(link.amountPaid || link.amount);
  const isCredits = plan?.type === "credits" && Number(plan.credits) > 0;
  const invoice: any = await createInvoice({
    student: studentId,
    plan: plan ? String(plan._id) : undefined,
    type: isCredits ? "credits" : "manual",
    credits: isCredits ? Number(plan.credits) : undefined,
    title: link.description,
    amount: paid,
    dueDate: link.paidAt || new Date(),
    issueDate: link.paidAt || new Date(),
    referenceNumber: link.razorpayPaymentId || link.referenceId,
    invoiceMode: "included",
    gstPercentage,
    notes: `Paid through sales payment link ${link.referenceId}, sent by ${link.createdByName || "sales"}.`,
    activity: { actor: actor.id, source: "manual_admin", label: `Invoice raised for a sales payment link paid by ${link.customerName}` },
  });
  const payment: any = await Payment.create({
    user: studentId,
    purpose: "invoice",
    refId: invoice._id,
    amount: paid,
    razorpayPaymentId: link.razorpayPaymentId,
    status: "paid",
    method: paymentMethodFromRazorpay(link.method),
    referenceNumber: link.razorpayPaymentId,
    invoiceNumber: invoice.invoiceNumber,
    paidAt: link.paidAt || new Date(),
  });
  await markInvoicePaid(String(invoice._id), String(payment._id), { actor: actor.id, source: "razorpay_payment_link", label: `Recorded sales link payment from ${link.customerName}` }, [], {}, { notifyStudent: false });
  link.attachedStudent = studentId;
  link.attachedInvoice = invoice._id;
  link.attachedAt = new Date();
  link.attachedBy = actor.id;
  await link.save();
  await recordActivity({
    actor: actor.id,
    targetUser: studentId,
    type: "sales.payment_link.attached",
    label: `Attached ${link.customerName}'s link payment to ${student.name} as ${invoice.invoiceNumber}`,
    entityType: "SalesPaymentLink",
    entityId: String(link._id),
    metadata: { invoice: String(invoice._id), payment: String(payment._id) },
  });
  const populated = await SalesPaymentLink.findById(link._id).populate("attachedStudent", "name").populate("attachedInvoice", "invoiceNumber").lean();
  return serialize(populated);
}
