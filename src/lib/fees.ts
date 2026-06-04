import { Types } from "mongoose";
import { AcademySettings, CreditLedger, FeeAssignment, Invoice, Notification } from "@/models/Fee";

const DAY = 24 * 60 * 60 * 1000;

export async function getAcademySettings() {
  const existing = await AcademySettings.findOne().lean();
  if (existing) return existing as any;
  const created = await AcademySettings.create({});
  return created.toObject();
}

export function invoiceBreakup(amount: number, lateFee: number, settings: any) {
  const taxableAmount = amount + lateFee;
  const gstPercentage = settings.invoiceMode === "gst" ? Number(settings.gstPercentage || 0) : 0;
  const gstAmount = Math.round((taxableAmount * gstPercentage) / 100);
  return {
    taxableAmount,
    gstPercentage,
    gstAmount,
    cgstAmount: Math.round(gstAmount / 2),
    sgstAmount: gstAmount - Math.round(gstAmount / 2),
    totalAmount: taxableAmount + gstAmount,
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

export function monthlyDueDate(startDate: Date, monthOffset = 0) {
  const due = new Date(startDate);
  due.setMonth(due.getMonth() + monthOffset);
  due.setHours(23, 59, 59, 999);
  return due;
}

export async function updateLateFees(now = new Date()) {
  const settings = await getAcademySettings();
  const overdue = await Invoice.find({
    status: { $in: ["unpaid", "overdue"] },
  }).populate("plan");

  for (const invoice of overdue) {
    const plan: any = (invoice as any).plan;
    const lateAfterDays = Number(plan?.lateFeeAfterDays ?? 10);
    if (invoice.dueDate >= new Date(now.getTime() - lateAfterDays * DAY)) continue;
    const lateFee = Number(plan?.lateFeeAmount ?? 50000);
    const breakup = invoiceBreakup(invoice.amount, lateFee, settings);
    invoice.lateFee = lateFee;
    invoice.status = "overdue";
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
  dueDate: Date;
  credits?: number;
  notes?: string;
}) {
  const settings = await getAcademySettings();
  const breakup = invoiceBreakup(input.amount, 0, settings);
  return Invoice.create({
    invoiceNumber: await nextInvoiceNumber(),
    ...input,
    issueDate: new Date(),
    lateFee: 0,
    ...breakup,
    status: "unpaid",
  });
}

export async function ensureMonthlyInvoices(now = new Date()) {
  const monthlyAssignments = await FeeAssignment.find({ type: "monthly" }).populate("plan").lean();
  for (const assignment of monthlyAssignments as any[]) {
    const start = new Date(assignment.billingStartDate);
    if (start > now || !assignment.plan) continue;

    const months =
      (now.getFullYear() - start.getFullYear()) * 12 +
      (now.getMonth() - start.getMonth());

    for (let offset = 0; offset <= months; offset += 1) {
      const dueDate = monthlyDueDate(start, offset);
      dueDate.setDate(dueDate.getDate() + Number(assignment.plan.dueAfterDays || 0));
      const exists = await Invoice.exists({
        assignment: assignment._id,
        type: "monthly",
        dueDate,
      });
      if (!exists) {
        await createInvoice({
          student: assignment.student.toString(),
          plan: assignment.plan._id.toString(),
          assignment: assignment._id.toString(),
          type: "monthly",
          title: `${assignment.plan.name} - ${dueDate.toLocaleString("en-IN", { month: "long", year: "numeric" })}`,
          amount: assignment.plan.amount,
          dueDate,
        });
      }
    }
  }
  await updateLateFees(now);
}

export async function markInvoicePaid(invoiceId: string, paymentId?: string) {
  const invoice: any = await Invoice.findByIdAndUpdate(
    invoiceId,
    { status: "paid", paidAt: new Date(), payment: paymentId },
    { new: true }
  );
  if (!invoice || invoice.type !== "credits" || !invoice.credits) return invoice;

  const assignment: any = await FeeAssignment.findOne({ student: invoice.student, type: "credits" });
  if (!assignment) return invoice;

  const balanceAfter = (assignment.creditBalance || 0) + invoice.credits;
  await FeeAssignment.findByIdAndUpdate(assignment._id, {
    $inc: { creditBalance: invoice.credits, totalCreditsPurchased: invoice.credits },
  });
  await CreditLedger.findOneAndUpdate(
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
  return invoice;
}

export async function consumeAttendanceCredit(studentId: string, attendanceId: string) {
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
  await CreditLedger.create({
    student: studentId,
    assignment: assignment._id,
    type: "attendance_consumption",
    credits: -1,
    balanceAfter: nextBalance,
    sourceType: "Attendance",
    sourceId: attendanceId,
    note: "Credit deducted after attendance was marked",
  });
  const settings: any = await getAcademySettings();
  if (nextBalance <= Number(settings.lowCreditThreshold ?? 3)) {
    await Notification.findOneAndUpdate(
      { user: studentId, type: "low_credits", "metadata.balance": nextBalance },
      {
        user: studentId,
        type: "low_credits",
        title: "Low credit balance",
        message: `Your remaining class credits are low (${nextBalance}). Please recharge to continue classes smoothly.`,
        metadata: { balance: nextBalance, threshold: settings.lowCreditThreshold ?? 3 },
      },
      { upsert: true, new: true }
    );
  }
}
