import "server-only";

import { rosterForSession } from "@/lib/classroomStudentExits";
import { loadCoachPay } from "@/lib/coachPayData";
import type { PayPeriod } from "@/lib/payPeriods";
import { Invoice } from "@/models/Fee";
import { Payment } from "@/models/Payment";

type Receipt = {
  student: string;
  totalAmount: number;
  gstAmount?: number;
  paidAt?: Date;
  paymentTransactions?: { amount: number; paidAt: Date }[];
};

type ProfitabilityRow = {
  coachId: string;
  name: string;
  revenue: number;
  cost: number;
  pendingReview: number;
  unpriced: number;
};

function collectedRevenue(receipt: Receipt, period: PayPeriod) {
  const inPeriod = (date?: Date) => date && date >= period.from && date <= period.to;
  const net = Math.max(0, receipt.totalAmount - (receipt.gstAmount || 0));
  if (!receipt.paymentTransactions?.length || receipt.totalAmount <= 0) {
    return inPeriod(receipt.paidAt) ? net : 0;
  }

  // Allocate GST proportionately across the instalments, retaining exact paise.
  let grossSoFar = 0;
  return receipt.paymentTransactions.reduce((sum, transaction) => {
    const previousNet = Math.round(grossSoFar * net / receipt.totalAmount);
    grossSoFar += transaction.amount;
    const transactionNet = Math.round(grossSoFar * net / receipt.totalAmount) - previousNet;
    return inPeriod(transaction.paidAt) ? sum + transactionNet : sum;
  }, 0);
}

export async function loadCoachProfitability(period: PayPeriod) {
  const { events, summary, classrooms } = await loadCoachPay(period);
  const dateWindow = { $gte: period.from, $lte: period.to };
  const [invoices, enrolments] = await Promise.all([
    Invoice.find({
      status: "paid",
      $or: [{ paidAt: dateWindow }, { "paymentTransactions.paidAt": dateWindow }],
    }).select("student totalAmount gstAmount paidAt paymentTransactions").lean<Receipt[]>(),
    Payment.find({
      status: "paid",
      purpose: "enrollment",
      currency: { $in: ["INR", null] },
      $or: [{ paidAt: dateWindow }, { "manualTransactions.paidAt": dateWindow }],
    }).select("user amount paidAt manualTransactions").lean<
      { user: string; amount: number; paidAt?: Date; manualTransactions?: Receipt["paymentTransactions"] }[]
    >(),
  ]);

  const rows = new Map<string, ProfitabilityRow>(summary.rows.map((row) => [row.coachId, {
    coachId: row.coachId,
    name: row.coachName,
    revenue: 0,
    cost: row.totalAmount,
    pendingReview: row.pendingReview,
    unpriced: row.unpriced,
  }]));

  const classesById = new Map(classrooms.map((classroom) => [String(classroom._id), classroom]));
  const classesByStudent = new Map<string, Map<string, number>>();
  for (const event of events) {
    if (event.isDemoClass || event.sessionStatus !== "completed" || !event.sessionId ||
      (event.kind !== "regular" && event.kind !== "substitute")) continue;
    const classroom = classesById.get(event.classroomId);
    const session = classroom?.generatedSessions?.find((item: { _id: unknown }) => String(item._id) === event.sessionId);
    if (!session) continue;
    const students = new Set(rosterForSession(classroom, session).map(String));
    for (const student of students) {
      const coachClasses = classesByStudent.get(student) ?? new Map<string, number>();
      coachClasses.set(event.coachId, (coachClasses.get(event.coachId) ?? 0) + 1);
      classesByStudent.set(student, coachClasses);
    }
  }

  const revenueByStudent = new Map<string, number>();
  const receipts = [...invoices, ...enrolments.map((payment) => ({
    student: payment.user,
    totalAmount: payment.amount,
    paidAt: payment.paidAt,
    paymentTransactions: payment.manualTransactions,
  }))];
  for (const receipt of receipts) {
    const studentId = String(receipt.student);
    const revenue = collectedRevenue(receipt, period);
    revenueByStudent.set(studentId, (revenueByStudent.get(studentId) ?? 0) + revenue);
  }

  let unallocatedRevenue = 0;
  for (const [studentId, revenue] of revenueByStudent) {
    const coachClasses = classesByStudent.get(studentId);
    if (!coachClasses) {
      unallocatedRevenue += revenue;
      continue;
    }

    const classCount = [...coachClasses.values()].reduce((total, count) => total + count, 0);
    let classesSoFar = 0;
    for (const [coachId, count] of [...coachClasses].sort(([left], [right]) => left.localeCompare(right))) {
      const previousShare = Math.round(revenue * classesSoFar / classCount);
      classesSoFar += count;
      rows.get(coachId)!.revenue += Math.round(revenue * classesSoFar / classCount) - previousShare;
    }
  }

  return {
    rows: [...rows.values()].sort((left, right) => right.revenue - left.revenue || left.name.localeCompare(right.name)),
    revenue: [...rows.values()].reduce((total, row) => total + row.revenue, 0),
    cost: summary.totalAmount,
    unallocatedRevenue,
    pendingReview: summary.pendingReview,
    unpriced: summary.unpriced,
  };
}
