import { Types } from "mongoose";
import { AcademySettings, CreditLedger, FeeAssignment, Invoice, Notification } from "@/models/Fee";
import { Payment } from "@/models/Payment";
import { User } from "@/models/User";
import { ACADEMY_DEFAULTS, ACADEMY_FAVICON_URL, ACADEMY_LOGO_URL, ACADEMY_SIGNATURE_URL } from "@/lib/branding";
import { recordActivity } from "@/lib/activity";

const DAY = 24 * 60 * 60 * 1000;

export async function getAcademySettings() {
  const existing = await AcademySettings.findOne().lean();
  if (existing) {
    return {
      ...(existing as any),
      academyName: (existing as any).academyName || ACADEMY_DEFAULTS.academyName,
      registeredAddress: (existing as any).registeredAddress || ACADEMY_DEFAULTS.registeredAddress,
      gstNumber: (existing as any).gstNumber || ACADEMY_DEFAULTS.gstNumber,
      email: (existing as any).email || ACADEMY_DEFAULTS.email,
      phone: (existing as any).phone || ACADEMY_DEFAULTS.phone,
      authorizedSignatory: ACADEMY_DEFAULTS.authorizedSignatory,
      logoUrl: ACADEMY_LOGO_URL,
      signatoryUrl: ACADEMY_SIGNATURE_URL,
      faviconUrl: ACADEMY_FAVICON_URL,
    } as any;
  }
  const created = await AcademySettings.create({
    academyName: ACADEMY_DEFAULTS.academyName,
    registeredAddress: ACADEMY_DEFAULTS.registeredAddress,
    gstNumber: ACADEMY_DEFAULTS.gstNumber,
    email: ACADEMY_DEFAULTS.email,
    phone: ACADEMY_DEFAULTS.phone,
    authorizedSignatory: ACADEMY_DEFAULTS.authorizedSignatory,
    logoUrl: ACADEMY_LOGO_URL,
    signatoryUrl: ACADEMY_SIGNATURE_URL,
    faviconUrl: ACADEMY_FAVICON_URL,
  });
  return created.toObject();
}

function resolveTaxMode(settings: any, options?: { gstMode?: string; gstPercentage?: number }) {
  const invoiceMode = options?.gstMode || (settings.invoiceMode === "gst" ? "excluded" : "non_gst");
  const gstPercentage = Number(options?.gstPercentage ?? settings.gstPercentage ?? 0);
  return {
    invoiceMode,
    gstPercentage: invoiceMode === "non_gst" ? 0 : gstPercentage,
  };
}

export function invoiceBreakup(amount: number, lateFee: number, settings: any, options?: { gstMode?: string; gstPercentage?: number }) {
  const grossAmount = amount + lateFee;
  const { invoiceMode, gstPercentage } = resolveTaxMode(settings, options);
  const divisor = 100 + gstPercentage;
  const taxableAmount = invoiceMode === "included" && gstPercentage > 0
    ? Math.round((grossAmount * 100) / divisor)
    : grossAmount;
  const gstAmount = invoiceMode === "non_gst" || gstPercentage <= 0
    ? 0
    : invoiceMode === "included"
      ? Math.max(0, grossAmount - taxableAmount)
      : Math.round((grossAmount * gstPercentage) / 100);
  const totalAmount = invoiceMode === "excluded" ? taxableAmount + gstAmount : grossAmount;
  return {
    invoiceMode,
    taxableAmount,
    gstPercentage,
    gstAmount,
    cgstAmount: Math.round(gstAmount / 2),
    sgstAmount: gstAmount - Math.round(gstAmount / 2),
    totalAmount,
  };
}

export async function nextInvoiceNumber() {
  const settings: any = await getAcademySettings();
  const now = new Date();
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const endYear = startYear + 1;
  const fy = `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`;
  const fyStart = new Date(startYear, 3, 1, 0, 0, 0, 0);
  const fyEnd = new Date(endYear, 2, 31, 23, 59, 59, 999);
  const count = await Invoice.countDocuments({ createdAt: { $gte: fyStart, $lte: fyEnd } });
  return `${settings.invoicePrefix || "ENV"}/${fy}/${String(count + 1).padStart(3, "0")}`;
}

async function nextAvailableInvoiceNumber() {
  const settings: any = await getAcademySettings();
  const now = new Date();
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const endYear = startYear + 1;
  const fy = `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`;
  const fyStart = new Date(startYear, 3, 1, 0, 0, 0, 0);
  const fyEnd = new Date(endYear, 2, 31, 23, 59, 59, 999);
  const prefix = settings.invoicePrefix || "ENV";
  let sequence = await Invoice.countDocuments({ createdAt: { $gte: fyStart, $lte: fyEnd } }) + 1;

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const invoiceNumber = `${prefix}/${fy}/${String(sequence).padStart(3, "0")}`;
    const exists = await Invoice.exists({ invoiceNumber });
    if (!exists) return invoiceNumber;
    sequence += 1;
  }

  return `${prefix}/${fy}/${Date.now()}`;
}

export function monthlyDueDate(startDate: Date, monthOffset = 0) {
  const due = new Date(startDate);
  due.setMonth(due.getMonth() + monthOffset);
  due.setHours(23, 59, 59, 999);
  return due;
}

export function nextMonthlyDueDate(dueDate: Date) {
  return monthlyDueDate(dueDate, 1);
}

export async function updateLateFees(now = new Date()) {
  const settings = await getAcademySettings();
  const overdue = await Invoice.find({
    status: { $in: ["unpaid", "overdue"] },
  }).populate("plan");

  for (const invoice of overdue) {
    const plan: any = (invoice as any).plan;
    const lateAfterDays = Math.min(7, Math.max(0, Number(plan?.lateFeeAfterDays ?? 7)));
    if (invoice.dueDate >= new Date(now.getTime() - lateAfterDays * DAY)) continue;
    const lateFee = Number(plan?.lateFeeAmount ?? 50000);
    const breakup = invoiceBreakup(invoice.amount, lateFee, settings, {
      gstMode: plan?.gstMode,
      gstPercentage: plan?.gstPercentage,
    });
    invoice.lateFee = lateFee;
    invoice.status = "overdue";
    invoice.invoiceMode = breakup.invoiceMode;
    invoice.taxableAmount = breakup.taxableAmount;
    invoice.gstPercentage = breakup.gstPercentage;
    invoice.gstAmount = breakup.gstAmount;
    invoice.cgstAmount = breakup.cgstAmount;
    invoice.sgstAmount = breakup.sgstAmount;
    invoice.totalAmount = breakup.totalAmount;
    await invoice.save();
  }
}

export async function createInvoice(input: {
  student: string;
  plan?: string;
  assignment?: string;
  type: "monthly" | "credits" | "manual";
  title: string;
  amount: number;
  issueDate?: Date;
  dueDate: Date;
  referenceNumber?: string;
  credits?: number;
  notes?: string;
  invoiceMode?: "included" | "excluded" | "non_gst";
  gstPercentage?: number;
  activity?: {
    actor?: string;
    source?: "manual_admin" | "plan_assignment" | "monthly_system" | "backend";
    label?: string;
  };
}) {
  const settings = await getAcademySettings();
  const breakup = invoiceBreakup(input.amount, 0, settings, {
    gstMode: input.invoiceMode,
    gstPercentage: input.gstPercentage,
  });
  const payload = {
    ...input,
    issueDate: input.issueDate && !Number.isNaN(input.issueDate.getTime()) ? input.issueDate : new Date(),
    referenceNumber: input.referenceNumber?.trim() || undefined,
    lateFee: 0,
    ...breakup,
    status: "unpaid",
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const invoice = await Invoice.create({
        invoiceNumber: await nextAvailableInvoiceNumber(),
        ...payload,
      });
      await recordActivity({
        actor: input.activity?.actor,
        targetUser: input.student,
        type: "fees.invoice.created",
        label: input.activity?.label || `Created invoice ${invoice.invoiceNumber}`,
        entityType: "Invoice",
        entityId: invoice._id.toString(),
        metadata: {
          invoiceNumber: invoice.invoiceNumber,
          invoiceType: input.type,
          amount: invoice.totalAmount,
          credits: input.credits || 0,
          source: input.activity?.source || "backend",
          plan: input.plan || "",
          assignment: input.assignment || "",
        },
      });
      return invoice;
    } catch (error: any) {
      if (error?.code !== 11000 || !error?.keyPattern?.invoiceNumber) throw error;
    }
  }

  const invoice = await Invoice.create({
    invoiceNumber: `${(settings as any).invoicePrefix || "ENV"}/${Date.now()}`,
    ...payload,
  });
  await recordActivity({
    actor: input.activity?.actor,
    targetUser: input.student,
    type: "fees.invoice.created",
    label: input.activity?.label || `Created invoice ${invoice.invoiceNumber}`,
    entityType: "Invoice",
    entityId: invoice._id.toString(),
    metadata: {
      invoiceNumber: invoice.invoiceNumber,
      invoiceType: input.type,
      amount: invoice.totalAmount,
      credits: input.credits || 0,
      source: input.activity?.source || "backend",
      plan: input.plan || "",
      assignment: input.assignment || "",
    },
  });
  return invoice;
}

export async function ensureMonthlyInvoices(now = new Date()) {
  const monthlyAssignments = await FeeAssignment.find({ type: "monthly" }).populate("plan student").lean();
  const horizon = new Date(now.getTime() + 3 * DAY);
  for (const assignment of monthlyAssignments as any[]) {
    const student = assignment.student;
    const studentId = student?._id?.toString?.() || student?.toString?.() || "";
    if (!studentId || !student || student.isActive === false || student.role !== "student") continue;
    const start = new Date(assignment.firstDueDate || assignment.billingStartDate);
    if (start > horizon || !assignment.plan || assignment.plan.isActive === false) continue;
    const deletedDueDateKeys = new Set((assignment.deletedMonthlyDueDates || []).map((date: any) => new Date(date).getTime()));

    const months =
      (horizon.getFullYear() - start.getFullYear()) * 12 +
      (horizon.getMonth() - start.getMonth());

    for (let offset = 0; offset <= months; offset += 1) {
      const dueDate = monthlyDueDate(start, offset);
      if (dueDate > horizon) continue;
      if (deletedDueDateKeys.has(dueDate.getTime())) continue;
      const exists = await Invoice.exists({
        assignment: assignment._id,
        type: "monthly",
        dueDate,
      });
      if (!exists) {
        await createInvoice({
          student: studentId,
          plan: assignment.plan._id.toString(),
          assignment: assignment._id.toString(),
          type: "monthly",
          title: `${assignment.plan.name} - ${dueDate.toLocaleString("en-IN", { month: "long", year: "numeric" })}`,
          amount: assignment.plan.amount,
          dueDate,
          invoiceMode: assignment.plan.gstMode || "non_gst",
          gstPercentage: assignment.plan.gstPercentage || 0,
          activity: { source: "monthly_system", label: `System generated monthly invoice for ${assignment.plan.name}` },
        });
      }
    }
  }
  await updateLateFees(now);
}

type ManualPaymentTransaction = {
  mode: "upi" | "bank_transfer" | "other";
  amount: number;
  paidAt: Date;
  referenceNumber?: string;
};

type InvoicePaymentAdjustment = {
  waiveLateFee?: boolean;
  discountAmount?: number;
  note?: string;
};

export function adjustedInvoicePayment(input: {
  amount: number;
  lateFee?: number;
  totalAmount: number;
  invoiceMode?: "included" | "excluded" | "non_gst";
  gstPercentage?: number;
}, adjustment: InvoicePaymentAdjustment = {}) {
  const lateFee = Math.max(0, Number(input.lateFee || 0));
  const discountAmount = Math.max(0, Number(adjustment.discountAmount || 0));
  const lateFeeWaivedAmount = adjustment.waiveLateFee ? lateFee : 0;
  const taxableBaseAmount = Math.max(0, Number(input.amount || 0) - discountAmount);
  const settings = {
    invoiceMode: input.invoiceMode === "non_gst" ? "non_gst" : "gst",
    gstPercentage: Number(input.gstPercentage || 0),
  };
  const breakup = invoiceBreakup(taxableBaseAmount, lateFee - lateFeeWaivedAmount, settings, {
    gstMode: input.invoiceMode || "non_gst",
    gstPercentage: Number(input.gstPercentage || 0),
  });
  return {
    ...breakup,
    amount: taxableBaseAmount,
    lateFee: lateFee - lateFeeWaivedAmount,
    lateFeeWaivedAmount,
    discountAmount,
    originalTotalAmount: Number(input.totalAmount || 0),
  };
}

export async function markInvoicePaid(
  invoiceId: string,
  paymentId?: string,
  activity?: { actor?: string; source?: "manual_admin" | "razorpay_checkout" | "razorpay_webhook" | "backend"; label?: string },
  transactions: ManualPaymentTransaction[] = [],
  adjustment: InvoicePaymentAdjustment = {}
) {
  const before: any = await Invoice.findById(invoiceId).select("status").lean();
  const existing: any = await Invoice.findById(invoiceId).populate("plan").lean();
  if (!existing) return existing;
  const adjusted = adjustedInvoicePayment({
    amount: existing.amount,
    lateFee: existing.lateFee,
    totalAmount: existing.totalAmount,
    invoiceMode: existing.invoiceMode,
    gstPercentage: existing.gstPercentage,
  }, adjustment);
  const paymentTotal = transactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  if (transactions.length && paymentTotal !== Number(adjusted.totalAmount || 0)) {
    throw new Error("Payment transactions must match the invoice total.");
  }
  let finalPaymentId = paymentId;
  if (!finalPaymentId && transactions.length) {
    const payment = await Payment.create({
      user: existing.student,
      purpose: "invoice",
      refId: existing._id,
      amount: paymentTotal,
      status: "paid",
      method: transactions[0]?.mode || "other",
      referenceNumber: transactions.map((transaction) => transaction.referenceNumber).filter(Boolean).join(", "),
      manualTransactions: transactions,
      invoiceNumber: existing.invoiceNumber,
      paidAt: transactions.map((transaction) => transaction.paidAt).sort((a, b) => b.getTime() - a.getTime())[0] || new Date(),
    });
    finalPaymentId = payment._id.toString();
  }
  const paidAt = transactions.length
    ? transactions.map((transaction) => transaction.paidAt).sort((a, b) => b.getTime() - a.getTime())[0]
    : new Date();
  const nextDueDate = existing.type === "monthly" ? nextMonthlyDueDate(new Date(existing.dueDate)) : undefined;
  const invoice: any = await Invoice.findByIdAndUpdate(
    invoiceId,
    {
      amount: adjusted.amount,
      lateFee: adjusted.lateFee,
      taxableAmount: adjusted.taxableAmount,
      gstPercentage: adjusted.gstPercentage,
      gstAmount: adjusted.gstAmount,
      cgstAmount: adjusted.cgstAmount,
      sgstAmount: adjusted.sgstAmount,
      totalAmount: adjusted.totalAmount,
      originalTotalAmount: adjusted.originalTotalAmount,
      lateFeeWaivedAmount: adjusted.lateFeeWaivedAmount,
      discountAmount: adjusted.discountAmount,
      paymentAdjustmentNote: adjustment.note?.trim() || undefined,
      status: "paid",
      paidAt,
      payment: finalPaymentId,
      ...(transactions.length ? { paymentTransactions: transactions } : {}),
      ...(nextDueDate ? { nextDueDate } : {}),
    },
    { new: true }
  );
  if (!invoice) return invoice;
  await recordActivity({
    actor: activity?.actor,
    targetUser: invoice.student?.toString?.() || String(invoice.student || ""),
    type: "fees.invoice.paid",
    label: activity?.label || `Marked invoice ${invoice.invoiceNumber} as paid`,
    entityType: "Invoice",
    entityId: invoice._id.toString(),
    metadata: {
      invoiceNumber: invoice.invoiceNumber,
      previousStatus: before?.status || "",
      source: activity?.source || "backend",
      payment: finalPaymentId || "",
      amount: invoice.totalAmount,
      invoiceType: invoice.type,
      transactionCount: transactions.length,
      lateFeeWaivedAmount: adjusted.lateFeeWaivedAmount,
      discountAmount: adjusted.discountAmount,
      originalTotalAmount: adjusted.originalTotalAmount,
      nextDueDate: nextDueDate || "",
    },
  });
  if (invoice.type !== "credits" || !invoice.credits) return invoice;

  const assignment: any = await FeeAssignment.findOne({ student: invoice.student, type: "credits" });
  if (!assignment) return invoice;

  const balanceAfter = (assignment.creditBalance || 0) + invoice.credits;
  await FeeAssignment.findByIdAndUpdate(assignment._id, {
    $inc: { creditBalance: invoice.credits, totalCreditsPurchased: invoice.credits },
  });
  const ledger: any = await CreditLedger.findOneAndUpdate(
    { student: invoice.student, type: "purchase", invoice: invoice._id },
    {
      student: invoice.student,
      assignment: assignment._id,
      invoice: invoice._id,
      type: "purchase",
      credits: invoice.credits,
      balanceAfter,
      note: `Credit purchase via ${invoice.invoiceNumber}`,
    },
    { upsert: true, new: true }
  );
  await recordActivity({
    actor: activity?.actor,
    targetUser: invoice.student?.toString?.() || String(invoice.student || ""),
    type: "fees.credits.purchased",
    label: `Applied ${invoice.credits} purchased credit${invoice.credits === 1 ? "" : "s"} from ${invoice.invoiceNumber}`,
    entityType: "CreditLedger",
    entityId: ledger._id.toString(),
    metadata: {
      invoice: invoice._id.toString(),
      invoiceNumber: invoice.invoiceNumber,
      assignment: assignment._id.toString(),
      credits: invoice.credits,
      balanceAfter,
      source: activity?.source || "backend",
      payment: finalPaymentId || "",
    },
  });
  return invoice;
}

export async function createNextMonthlyInvoiceAfterPayment(invoiceId: string) {
  const invoice: any = await Invoice.findById(invoiceId).populate("assignment plan").lean();
  if (!invoice || invoice.type !== "monthly" || !invoice.assignment || !invoice.plan) return null;
  const student: any = await User.findById(invoice.student).select("role isActive").lean();
  if (!student || student.role !== "student" || student.isActive === false) return null;
  const dueDate = nextMonthlyDueDate(new Date(invoice.dueDate));
  const exists = await Invoice.exists({ assignment: invoice.assignment._id, type: "monthly", dueDate });
  if (exists) return null;
  return createInvoice({
    student: invoice.student.toString(),
    plan: invoice.plan._id.toString(),
    assignment: invoice.assignment._id.toString(),
    type: "monthly",
    title: `${invoice.plan.name} - ${dueDate.toLocaleString("en-IN", { month: "long", year: "numeric" })}`,
    amount: invoice.plan.amount,
    dueDate,
    invoiceMode: invoice.plan.gstMode || "non_gst",
    gstPercentage: invoice.plan.gstPercentage || 0,
    activity: { source: "monthly_system", label: `Generated next monthly invoice after ${invoice.invoiceNumber} was paid` },
  });
}

export async function consumeAttendanceCredit(studentId: string, attendanceId: string, note = "Credit deducted after attendance was marked") {
  const assignment: any = await FeeAssignment.findOne({ student: studentId, type: "credits" });
  if (!assignment) return;

  const existing = await CreditLedger.exists({
    student: studentId,
    type: "attendance_consumption",
    sourceType: "Attendance",
    sourceId: new Types.ObjectId(attendanceId),
  });
  if (existing) return;

  const shouldDeduct = (assignment.creditBalance || 0) > 0;
  const nextBalance = Math.max(0, (assignment.creditBalance || 0) - 1);
  await FeeAssignment.findByIdAndUpdate(assignment._id, {
    $inc: { creditBalance: shouldDeduct ? -1 : 0, totalCreditsConsumed: 1 },
  });
  const ledger = await CreditLedger.create({
    student: studentId,
    assignment: assignment._id,
    type: "attendance_consumption",
    credits: -1,
    balanceAfter: nextBalance,
    sourceType: "Attendance",
    sourceId: attendanceId,
    note,
  });
  await recordActivity({
    targetUser: studentId,
    type: "fees.credits.consumed",
    label: "Deducted 1 class credit after attendance",
    entityType: "CreditLedger",
    entityId: ledger._id.toString(),
    metadata: { attendance: attendanceId, assignment: assignment._id.toString(), credits: -1, balanceAfter: nextBalance, source: "attendance" },
  });
  const settings: any = await getAcademySettings();
  const lowCreditThreshold = 1;
  if (nextBalance <= lowCreditThreshold) {
    await Notification.findOneAndUpdate(
      { user: studentId, type: "low_credits", "metadata.balance": nextBalance },
      {
        user: studentId,
        type: "low_credits",
        title: "Low credit balance",
        message: `Your remaining class credits are low (${nextBalance}). Please recharge to continue classes smoothly.`,
        metadata: { balance: nextBalance, threshold: lowCreditThreshold },
      },
      { upsert: true, new: true }
    );
  }
}
