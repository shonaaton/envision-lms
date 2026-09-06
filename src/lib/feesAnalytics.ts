import "server-only";

import { Booking } from "@/models/Booking";
import { Classroom } from "@/models/Classroom";
import { DeletedInvoice, FeeAssignment, FeePlan, Invoice } from "@/models/Fee";
import { StudentPause } from "@/models/StudentPause";
import { User } from "@/models/User";
import { getAcademySettings, invoiceBreakup } from "@/lib/fees";
import {
  dateKey,
  inRange,
  invoiceIssuedAt,
  isGstInvoice,
  isOpenInvoice as isOpen,
  joinedAt,
  leftAt,
  matchesGst,
  mergeLostInvoices,
  monthlyCyclesInRange,
  pauseHoldWindow,
  planMatchesGst,
  rangeLabel,
  rate,
  retentionBucket,
  toDate,
  unbilledPauseCycles,
} from "@/lib/feesMetrics";

import type { CoachConversionRow, DetailColumn, DetailTable, FeesAnalytics, GstFilter } from "@/lib/feesAnalyticsTypes";

export type { CoachConversionRow, ColumnType, DetailColumn, DetailTable, FeesAnalytics, GstFilter } from "@/lib/feesAnalyticsTypes";
export { dateKey, resolveRange } from "@/lib/feesMetrics";

const MAX_ROWS = 500;

/* ------------------------------------------------------------------ utils */

function idOf(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

function sum(rows: any[], pick: (row: any) => number) {
  return rows.reduce((total, row) => total + Number(pick(row) || 0), 0);
}

function studentLabel(student: any) {
  return student?.name || student?.username || "Unknown student";
}

function planGross(plan: any, settings: any) {
  if (!plan) return 0;
  return invoiceBreakup(Number(plan.amount || 0), 0, settings, {
    gstMode: plan.gstMode || "non_gst",
    gstPercentage: Number(plan.gstPercentage || 0),
  }).totalAmount;
}

/* -------------------------------------------------------------- analytics */

export async function getFeesAnalytics(options: { from: Date; to: Date; gst: GstFilter }): Promise<FeesAnalytics> {
  const { from, to, gst } = options;
  const now = new Date();
  const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [settings, invoices, assignments, students, coaches, demoBookings, classrooms, deletedInvoices, feePlans, pauses] = await Promise.all([
    getAcademySettings(),
    Invoice.find({})
      .populate("student", "name username email isActive createdAt deactivatedAt accountStatus conversionSetup")
      .populate("plan", "name type amount credits gstMode gstPercentage billingDay dueAfterDays isActive")
      .sort({ createdAt: -1 })
      .lean(),
    FeeAssignment.find({})
      .populate("student", "name username email isActive isPaused createdAt deactivatedAt accountStatus conversionSetup role")
      .populate("plan", "name type amount credits gstMode gstPercentage billingDay dueAfterDays isActive")
      .lean(),
    User.find({ role: "student" })
      .select("name username email createdAt updatedAt deactivatedAt isActive isPaused accountStatus conversionSetup")
      .lean(),
    User.find({ role: { $in: ["instructor", "admin", "sub-admin"] } }).select("name username email").lean(),
    Booking.find({ bookingType: "demo" })
      .select("student instructor assignedCoach startAt status demoStatus feedbackStatus createdAt")
      .lean(),
    Classroom.find({
      isActive: { $ne: false },
      status: { $ne: "cancelled" },
      isSessionInstance: { $ne: true },
      classroomType: { $ne: "demo" },
    })
      .select("title students classDate startDate status generatedSessions")
      .lean(),
    DeletedInvoice.find({}).populate("student", "name username").sort({ deletedAt: -1 }).lean(),
    FeePlan.find({}).lean(),
    StudentPause.find({ status: { $ne: "cancelled" } })
      .populate("student", "name username email isActive")
      .sort({ pausedFrom: -1 })
      .lean(),
  ]);

  const studentById = new Map<string, any>();
  for (const student of students as any[]) studentById.set(idOf(student), student);
  const coachById = new Map<string, any>();
  for (const coach of coaches as any[]) coachById.set(idOf(coach), coach);
  const assignmentByStudent = new Map<string, any>();
  for (const assignment of assignments as any[]) assignmentByStudent.set(idOf(assignment.student), assignment);
  const planById = new Map<string, any>();
  for (const plan of feePlans as any[]) planById.set(idOf(plan), plan);

  const scoped = (invoices as any[]).filter((invoice) => matchesGst(invoice, gst));

  const tables: Record<string, DetailTable> = {};
  const addTable = (table: DetailTable) => {
    tables[table.id] = { ...table, rows: table.rows.slice(0, MAX_ROWS) };
  };

  const invoiceRow = (invoice: any) => ({
    invoice: invoice.invoiceNumber || "-",
    student: studentLabel(invoice.student),
    plan: invoice.plan?.name || invoice.type,
    mode: isGstInvoice(invoice) ? "GST" : "Non-GST",
    issued: invoiceIssuedAt(invoice),
    due: invoice.dueDate,
    base: Number(invoice.taxableAmount || invoice.amount || 0),
    gst: Number(invoice.gstAmount || 0),
    lateFee: Number(invoice.lateFee || 0),
    discount: Number(invoice.discountAmount || 0) + Number(invoice.lateFeeWaivedAmount || 0),
    total: Number(invoice.totalAmount || 0),
    status: invoice.status,
    paidAt: invoice.paidAt || null,
  });

  const invoiceColumns: DetailColumn[] = [
    { key: "invoice", label: "Invoice" },
    { key: "student", label: "Student" },
    { key: "plan", label: "Plan" },
    { key: "mode", label: "Tax", type: "badge" },
    { key: "due", label: "Due", type: "date" },
    { key: "total", label: "Total", type: "money", align: "right" },
    { key: "status", label: "Status", type: "badge" },
  ];

  /* ------------------------------------------------------- 1. collections */

  const paidInRange = scoped.filter((invoice) => invoice.status === "paid" && inRange(invoice.paidAt, from, to));
  const issuedInRange = scoped.filter((invoice) => inRange(invoiceIssuedAt(invoice), from, to));
  const outstanding = scoped.filter((invoice) => {
    const due = toDate(invoice.dueDate);
    return isOpen(invoice) && !!due && due.getTime() <= now.getTime();
  });
  const dueSoon = scoped.filter((invoice) => {
    const due = toDate(invoice.dueDate);
    return isOpen(invoice) && !!due && due.getTime() > now.getTime() && due.getTime() <= next7Days.getTime();
  });
  const discounted = paidInRange.filter(
    (invoice) => Number(invoice.discountAmount || 0) + Number(invoice.lateFeeWaivedAmount || 0) > 0
  );
  // The paid invoices split cleanly in two by tax treatment, so the gross taken
  // on GST invoices plus the gross taken on non-GST invoices is the whole total.
  // That is a different question from "total minus the tax component", which is
  // what `netCollected` answers.
  const gstInvoicesPaid = paidInRange.filter((invoice) => isGstInvoice(invoice));
  const nonGstInvoicesPaid = paidInRange.filter((invoice) => !isGstInvoice(invoice));

  const collected = sum(paidInRange, (i) => i.totalAmount);
  const gstCollected = sum(paidInRange, (i) => i.gstAmount);
  const gstInvoiceCollected = sum(gstInvoicesPaid, (i) => i.totalAmount);
  const nonGstCollected = sum(nonGstInvoicesPaid, (i) => i.totalAmount);
  const lateFeeCollected = sum(paidInRange, (i) => i.lateFee);
  const discountValue = sum(discounted, (i) => Number(i.discountAmount || 0) + Number(i.lateFeeWaivedAmount || 0));

  addTable({
    id: "collected",
    title: "Fees collected",
    subtitle: `Invoices marked paid between ${rangeLabel(from, to)}`,
    columns: [
      { key: "invoice", label: "Invoice" },
      { key: "student", label: "Student" },
      { key: "plan", label: "Plan" },
      { key: "mode", label: "Tax", type: "badge" },
      { key: "paidAt", label: "Paid on", type: "date" },
      { key: "base", label: "Base", type: "money", align: "right" },
      { key: "gst", label: "GST", type: "money", align: "right" },
      { key: "total", label: "Total", type: "money", align: "right" },
    ],
    rows: paidInRange.map(invoiceRow),
    totals: { base: sum(paidInRange, (i) => i.taxableAmount || i.amount), gst: gstCollected, total: collected },
  });

  addTable({
    id: "gst",
    title: "GST collected",
    subtitle: "Tax component of every GST invoice paid inside the range",
    columns: [
      { key: "invoice", label: "Invoice" },
      { key: "student", label: "Student" },
      { key: "paidAt", label: "Paid on", type: "date" },
      { key: "base", label: "Taxable", type: "money", align: "right" },
      { key: "gstPercentage", label: "GST %", type: "number", align: "right" },
      { key: "gst", label: "GST", type: "money", align: "right" },
      { key: "total", label: "Total", type: "money", align: "right" },
    ],
    rows: gstInvoicesPaid.map((invoice) => ({ ...invoiceRow(invoice), gstPercentage: Number(invoice.gstPercentage || 0) })),
    totals: { gst: gstCollected, total: gstInvoiceCollected },
  });

  addTable({
    id: "nonGstCollected",
    title: "Non-GST fees collected",
    subtitle: "Money received on invoices raised without any GST",
    columns: [
      { key: "invoice", label: "Invoice" },
      { key: "student", label: "Student" },
      { key: "plan", label: "Plan" },
      { key: "paidAt", label: "Paid on", type: "date" },
      { key: "total", label: "Amount", type: "money", align: "right" },
    ],
    rows: nonGstInvoicesPaid.map(invoiceRow),
    totals: { total: nonGstCollected },
    footnote: "No tax was charged on these invoices, so the full amount is academy earnings.",
  });

  addTable({
    id: "lateFees",
    title: "Late fees collected",
    subtitle: "Late fee component recovered inside the range",
    columns: [
      { key: "invoice", label: "Invoice" },
      { key: "student", label: "Student" },
      { key: "paidAt", label: "Paid on", type: "date" },
      { key: "lateFee", label: "Late fee", type: "money", align: "right" },
      { key: "total", label: "Invoice total", type: "money", align: "right" },
    ],
    rows: paidInRange.filter((invoice) => Number(invoice.lateFee || 0) > 0).map(invoiceRow),
    totals: { lateFee: lateFeeCollected },
  });

  addTable({
    id: "discounts",
    title: "Discounts and waivers",
    subtitle: "Value given away as discounts or waived late fees",
    columns: [
      { key: "invoice", label: "Invoice" },
      { key: "student", label: "Student" },
      { key: "paidAt", label: "Paid on", type: "date" },
      { key: "discount", label: "Given away", type: "money", align: "right" },
      { key: "total", label: "Collected", type: "money", align: "right" },
      { key: "note", label: "Reason" },
    ],
    rows: discounted.map((invoice) => ({ ...invoiceRow(invoice), note: invoice.paymentAdjustmentNote || "-" })),
    totals: { discount: discountValue, total: sum(discounted, (i) => i.totalAmount) },
  });

  addTable({
    id: "outstanding",
    title: "Outstanding fees",
    subtitle: "Unpaid invoices whose due date has already passed",
    columns: invoiceColumns,
    rows: outstanding.map(invoiceRow),
    totals: { total: sum(outstanding, (i) => i.totalAmount) },
    footnote: "Outstanding is measured as of today, so it does not move with the date range.",
  });

  addTable({
    id: "dueSoon",
    title: "Due in the next 7 days",
    subtitle: `Unpaid invoices due by ${next7Days.toLocaleDateString("en-IN")}`,
    columns: invoiceColumns,
    rows: dueSoon.map(invoiceRow),
    totals: { total: sum(dueSoon, (i) => i.totalAmount) },
  });

  addTable({
    id: "issued",
    title: "Invoices issued",
    subtitle: `Invoices raised between ${rangeLabel(from, to)}`,
    columns: [
      { key: "invoice", label: "Invoice" },
      { key: "student", label: "Student" },
      { key: "plan", label: "Plan" },
      { key: "mode", label: "Tax", type: "badge" },
      { key: "issued", label: "Issued", type: "date" },
      { key: "total", label: "Total", type: "money", align: "right" },
      { key: "status", label: "Status", type: "badge" },
    ],
    rows: issuedInRange.map(invoiceRow),
    totals: { total: sum(issuedInRange, (i) => i.totalAmount) },
  });

  addTable({
    id: "deletedInvoices",
    title: "Deleted invoices",
    subtitle: "Audit trail of every invoice removed, with the reason recorded",
    columns: [
      { key: "invoice", label: "Invoice" },
      { key: "student", label: "Student" },
      { key: "deletedAt", label: "Deleted", type: "datetime" },
      { key: "deletedBy", label: "Deleted by" },
      { key: "total", label: "Amount", type: "money", align: "right" },
      { key: "reason", label: "Reason" },
    ],
    rows: (deletedInvoices as any[]).map((invoice) => ({
      invoice: invoice.invoiceNumber || "-",
      student: invoice.studentName || studentLabel(invoice.student),
      deletedAt: invoice.deletedAt,
      deletedBy: invoice.deletedByName || "-",
      total: Number(invoice.totalAmount || 0),
      reason: invoice.deletionReason || "-",
    })),
  });

  /* ------------------------------------------------------------ 2. growth */

  const newStudents = (students as any[]).filter(
    (student) => student.accountStatus !== "demo" && inRange(joinedAt(student), from, to)
  );
  const newStudentIds = new Set(newStudents.map((student) => idOf(student)));
  const newStudentInvoices = scoped.filter((invoice) => newStudentIds.has(idOf(invoice.student)));
  const newStudentBilled = sum(
    newStudentInvoices.filter((invoice) => invoice.status !== "cancelled"),
    (i) => i.totalAmount
  );
  const newStudentCollected = sum(
    newStudentInvoices.filter((invoice) => invoice.status === "paid"),
    (i) => i.totalAmount
  );
  const newStudentRecurring = newStudents.reduce((total, student) => {
    const assignment = assignmentByStudent.get(idOf(student));
    return total + (assignment ? planGross(assignment.plan, settings) : 0);
  }, 0);

  addTable({
    id: "newStudents",
    title: "New students added",
    subtitle: "Sales growth - students enrolled inside the range and the fees they brought in",
    columns: [
      { key: "student", label: "Student" },
      { key: "username", label: "Student ID" },
      { key: "joined", label: "Joined", type: "date" },
      { key: "plan", label: "Plan" },
      { key: "planValue", label: "Plan value", type: "money", align: "right" },
      { key: "billed", label: "Billed", type: "money", align: "right" },
      { key: "collected", label: "Collected", type: "money", align: "right" },
      { key: "source", label: "Source", type: "badge" },
    ],
    rows: newStudents.map((student) => {
      const id = idOf(student);
      const assignment = assignmentByStudent.get(id);
      const own = newStudentInvoices.filter((invoice) => idOf(invoice.student) === id);
      return {
        student: studentLabel(student),
        username: student.username || "-",
        joined: joinedAt(student),
        plan: assignment?.plan?.name || "No plan assigned",
        planValue: assignment ? planGross(assignment.plan, settings) : 0,
        billed: sum(own.filter((invoice) => invoice.status !== "cancelled"), (i) => i.totalAmount),
        collected: sum(own.filter((invoice) => invoice.status === "paid"), (i) => i.totalAmount),
        source: student.conversionSetup?.convertedAt ? "Demo conversion" : "Direct",
      };
    }),
    totals: { planValue: newStudentRecurring, billed: newStudentBilled, collected: newStudentCollected },
  });

  /* ------------------------------------------------------------- 3. churn */

  const leftStudents = (students as any[]).filter(
    (student) => student.isActive === false && inRange(leftAt(student), from, to)
  );
  const leftStudentIds = new Set(leftStudents.map((student) => idOf(student)));
  const leftInvoices = scoped.filter((invoice) => leftStudentIds.has(idOf(invoice.student)));
  const churnRecurringLost = leftStudents.reduce((total, student) => {
    const assignment = assignmentByStudent.get(idOf(student));
    return total + (assignment ? planGross(assignment.plan, settings) : 0);
  }, 0);
  const churnUnpaid = sum(leftInvoices.filter(isOpen), (i) => i.totalAmount);
  const churnLifetime = sum(
    leftInvoices.filter((invoice) => invoice.status === "paid"),
    (i) => i.totalAmount
  );

  addTable({
    id: "deactivatedStudents",
    title: "Students who left",
    subtitle: "Deactivated accounts and the recurring fee value lost with them",
    columns: [
      { key: "student", label: "Student" },
      { key: "username", label: "Student ID" },
      { key: "joined", label: "Joined", type: "date" },
      { key: "left", label: "Left", type: "date" },
      { key: "plan", label: "Plan" },
      { key: "planValue", label: "Value lost / cycle", type: "money", align: "right" },
      { key: "unpaid", label: "Unpaid dues", type: "money", align: "right" },
      { key: "lifetime", label: "Lifetime paid", type: "money", align: "right" },
    ],
    rows: leftStudents.map((student) => {
      const id = idOf(student);
      const assignment = assignmentByStudent.get(id);
      const own = leftInvoices.filter((invoice) => idOf(invoice.student) === id);
      return {
        student: studentLabel(student),
        username: student.username || "-",
        joined: joinedAt(student),
        left: leftAt(student),
        plan: assignment?.plan?.name || "No plan assigned",
        planValue: assignment ? planGross(assignment.plan, settings) : 0,
        unpaid: sum(own.filter(isOpen), (i) => i.totalAmount),
        lifetime: sum(own.filter((invoice) => invoice.status === "paid"), (i) => i.totalAmount),
      };
    }),
    totals: { planValue: churnRecurringLost, unpaid: churnUnpaid, lifetime: churnLifetime },
    footnote: "Accounts deactivated before this dashboard shipped fall back to their last profile update date.",
  });

  /* ------------------------------------------------------- 3b. paused students

     A pause is a real but temporary revenue loss, and the money disappears in
     three different ways - so all three have to be gathered or the total reads
     zero while students are visibly out of class:

       1. the pause voids the invoices already raised (status -> cancelled),
       2. an admin deletes invoices for the paused month, which moves them out
          of `Invoice` into `DeletedInvoice` *and* records the due date on
          `deletedMonthlyDueDates` so monthly billing never raises them again,
       3. monthly billing skips a paused student, so cycles still inside the
          pause window are never raised in the first place.

     Every invoice is keyed by its number (falling back to its due date) so an
     invoice that was voided by the pause and later deleted is counted once. */

  const pausesInRange = (pauses as any[]).filter((pause) => !!pauseHoldWindow(pause.pausedFrom, pause.pausedUntil, from, to));

  const cancelledByStudent = new Map<string, any[]>();
  for (const invoice of scoped) {
    if (invoice.status !== "cancelled") continue;
    const key = idOf(invoice.student);
    if (!cancelledByStudent.has(key)) cancelledByStudent.set(key, []);
    cancelledByStudent.get(key)!.push(invoice);
  }
  const deletedByStudent = new Map<string, any[]>();
  for (const record of deletedInvoices as any[]) {
    // The archive keeps the whole original invoice, so the GST selector can
    // still classify it; a record without a snapshot falls back to non-GST.
    if (!matchesGst(record.invoiceSnapshot || record, gst)) continue;
    const key = idOf(record.student);
    if (!deletedByStudent.has(key)) deletedByStudent.set(key, []);
    deletedByStudent.get(key)!.push(record);
  }

  const pauseRows: Record<string, any>[] = [];
  const lostInvoiceRows: Record<string, any>[] = [];
  let pausedVoidedValue = 0;
  let pausedUnbilledValue = 0;
  let pausedVoidedCount = 0;

  for (const pause of pausesInRange) {
    const studentId = idOf(pause.student);
    const assignment = assignmentByStudent.get(studentId);
    // Fall back to the plan captured on the pause when the live fee assignment
    // has since been removed, otherwise the plan value reads as zero.
    const plan = assignment?.plan || planById.get(idOf(pause.feeSnapshot?.plan)) || null;
    const student = studentLabel(pause.student);
    const { holdFrom, holdTo } = pauseHoldWindow(pause.pausedFrom, pause.pausedUntil, from, to)!;

    // One entry per lost invoice, whatever route it took out of the ledger.
    // Deletion is the most final state, so it is offered first and wins the key.
    const lost = mergeLostInvoices(
      [
        ...(deletedByStudent.get(studentId) || []).map((record: any) => ({
          invoice: record.invoiceNumber,
          title: record.title,
          due: record.dueDate,
          total: record.totalAmount,
          source: "Deleted",
          wasStatus: record.status,
        })),
        ...(pause.voidedInvoices || []).map((entry: any) => ({
          invoice: entry.invoiceNumber,
          title: entry.title,
          due: entry.dueDate,
          total: entry.totalAmount,
          source: "Voided by pause",
          wasStatus: entry.previousStatus,
        })),
        ...(cancelledByStudent.get(studentId) || []).map((invoice: any) => ({
          invoice: invoice.invoiceNumber,
          title: invoice.title,
          due: invoice.dueDate,
          total: invoice.totalAmount,
          source: "Cancelled",
          wasStatus: "cancelled",
        })),
      ],
      from,
      to
    );

    const voidedValue = sum(lost, (entry) => entry.total);

    // Monthly plans bill on a fixed anchor, so any cycle still inside the pause
    // window with no invoice behind it is revenue that was never raised at all.
    const isMonthly = (pause.feeSnapshot?.planType || assignment?.type) === "monthly";
    const anchor = toDate(pause.feeSnapshot?.firstDueDate || pause.feeSnapshot?.billingStartDate)
      || toDate(assignment?.firstDueDate || assignment?.billingStartDate);
    const perCycle = plan ? planGross(plan, settings) : 0;
    const unbilledCycles = isMonthly && anchor && planMatchesGst(plan, gst)
      ? unbilledPauseCycles(anchor, holdFrom, holdTo, lost.map((entry) => entry.due))
      : [];
    const unbilledValue = unbilledCycles.length * perCycle;

    pausedVoidedValue += voidedValue;
    pausedUnbilledValue += unbilledValue;
    pausedVoidedCount += lost.length;

    for (const entry of lost) {
      lostInvoiceRows.push({ ...entry, student });
    }
    for (const due of unbilledCycles) {
      lostInvoiceRows.push({
        invoice: "-",
        student,
        title: `${plan?.name || "Monthly plan"} - never raised`,
        due,
        wasStatus: "not billed",
        total: perCycle,
        source: "Never billed",
      });
    }

    pauseRows.push({
      pauseId: idOf(pause),
      student,
      batch: pause.batchName || "-",
      plan: plan?.name || pause.feeSnapshot?.planName || "No plan assigned",
      pausedFrom: pause.pausedFrom,
      pausedUntil: pause.pausedUntil,
      restart: pause.expectedRestartDate || pause.pausedUntil,
      voidedCount: lost.length,
      voidedValue,
      unbilledCycles: unbilledCycles.length,
      unbilledValue,
      onHold: voidedValue + unbilledValue,
      state: pause.status === "resumed" ? "Back in class" : "Paused",
    });
  }

  const pausedOnHold = pausedVoidedValue + pausedUnbilledValue;
  const pausesActive = pausesInRange.filter((pause) => pause.status === "active");
  const pausesReturning = pausesInRange.filter((pause) => inRange(pause.expectedRestartDate || pause.pausedUntil, from, to));
  const returningPauseIds = new Set(pausesReturning.map((pause) => idOf(pause)));
  const pausedStudentIds = new Set(pausesActive.map((pause) => idOf(pause.student)));

  addTable({
    id: "pausedStudents",
    title: "Paused students",
    subtitle: "Students out of class this range, and the fee value held back while they are away",
    columns: [
      { key: "student", label: "Student" },
      { key: "batch", label: "Batch" },
      { key: "plan", label: "Plan" },
      { key: "pausedFrom", label: "Paused from", type: "date" },
      { key: "pausedUntil", label: "Paused till", type: "date" },
      { key: "restart", label: "Restarts", type: "date" },
      { key: "voidedCount", label: "Invoices lost", type: "number", align: "right" },
      { key: "voidedValue", label: "Voided / deleted", type: "money", align: "right" },
      { key: "unbilledValue", label: "Never billed", type: "money", align: "right" },
      { key: "onHold", label: "On hold", type: "money", align: "right" },
      { key: "state", label: "Status", type: "badge" },
    ],
    rows: pauseRows.sort((a, b) => b.onHold - a.onHold),
    totals: { voidedValue: pausedVoidedValue, unbilledValue: pausedUnbilledValue, onHold: pausedOnHold },
    footnote:
      "On hold = every invoice for this range that the pause voided or an admin deleted, plus the monthly cycles inside the pause window that were never raised at all. Credit plans count lost invoices only, since they have no fixed billing cycle.",
  });

  addTable({
    id: "pausedVoidedInvoices",
    title: "Revenue lost to a pause",
    subtitle: "Every invoice a paused student would have paid this range, and how it left the ledger",
    columns: [
      { key: "invoice", label: "Invoice" },
      { key: "student", label: "Student" },
      { key: "title", label: "Invoice for" },
      { key: "due", label: "Was due", type: "date" },
      { key: "source", label: "How it was lost", type: "badge" },
      { key: "wasStatus", label: "Was", type: "badge" },
      { key: "total", label: "Amount", type: "money", align: "right" },
    ],
    rows: lostInvoiceRows.sort((a, b) => new Date(b.due).getTime() - new Date(a.due).getTime()),
    totals: { total: pausedOnHold },
    footnote: "Voided by pause = cancelled automatically when the student was paused. Deleted = removed by an admin, which also stops monthly billing from ever raising it again. Never billed = a cycle that was skipped because the student was paused.",
  });

  addTable({
    id: "pausedReturning",
    title: "Students due back",
    subtitle: "Pauses ending inside this range - revenue that should restart",
    columns: [
      { key: "student", label: "Student" },
      { key: "batch", label: "Batch" },
      { key: "restart", label: "Restarts", type: "date" },
      { key: "onHold", label: "Was on hold", type: "money", align: "right" },
      { key: "state", label: "Status", type: "badge" },
    ],
    rows: pauseRows.filter((row) => returningPauseIds.has(row.pauseId)),
  });

  /* ------------------------------------------------------------- 4. demos */

  const demosInRange = (demoBookings as any[]).filter((booking) => inRange(booking.startAt, from, to));
  const demoDone = demosInRange.filter(
    (booking) =>
      booking.demoStatus === "COMPLETED" || booking.demoStatus === "CONVERTED" || booking.feedbackStatus === "submitted"
  );
  const demoConverted = demosInRange.filter((booking) => {
    if (booking.demoStatus === "CONVERTED") return true;
    const student = studentById.get(idOf(booking.student));
    return !!student && idOf(student.conversionSetup?.convertedFromBooking) === idOf(booking);
  });
  const demoNoShow = demosInRange.filter(
    (booking) => booking.demoStatus === "STUDENT_NO_SHOW" || booking.demoStatus === "ABSENT"
  );
  const convertedStudentIds = new Set(demoConverted.map((booking) => idOf(booking.student)));
  const demoRevenue = sum(
    scoped.filter((invoice) => convertedStudentIds.has(idOf(invoice.student)) && invoice.status === "paid"),
    (i) => i.totalAmount
  );

  const coachBuckets = new Map<string, CoachConversionRow>();
  const bucketFor = (booking: any) => {
    const coachId = idOf(booking.assignedCoach || booking.instructor) || "unassigned";
    if (!coachBuckets.has(coachId)) {
      coachBuckets.set(coachId, {
        coachId,
        coach: coachId === "unassigned" ? "Not assigned" : coachById.get(coachId)?.name || "Coach",
        scheduled: 0,
        done: 0,
        converted: 0,
        noShow: 0,
        rate: 0,
      });
    }
    return coachBuckets.get(coachId)!;
  };
  for (const booking of demosInRange) bucketFor(booking).scheduled += 1;
  for (const booking of demoDone) bucketFor(booking).done += 1;
  for (const booking of demoConverted) bucketFor(booking).converted += 1;
  for (const booking of demoNoShow) bucketFor(booking).noShow += 1;
  const coachConversion = [...coachBuckets.values()]
    .map((row) => ({ ...row, rate: rate(row.converted, row.done) }))
    .sort((a, b) => b.converted - a.converted || b.done - a.done);

  const demoStatusLabel = (booking: any) => {
    if (booking.demoStatus === "CONVERTED") return "Converted";
    if (booking.demoStatus === "COMPLETED") return "Demo done";
    if (booking.demoStatus === "STUDENT_NO_SHOW") return "No show";
    if (booking.demoStatus === "ABSENT") return "Missed";
    if (booking.demoStatus === "CLOSED" || booking.status === "cancelled") return "Closed";
    if (booking.demoStatus === "ASSESSMENT_PENDING") return "Assessment pending";
    if (booking.demoStatus === "CLASSROOM_CREATED") return "Scheduled";
    return "Requested";
  };

  const coachName = (booking: any) => {
    const coachId = idOf(booking.assignedCoach || booking.instructor);
    if (!coachId) return "Not assigned";
    return coachById.get(coachId)?.name || "Coach";
  };

  const demoRow = (booking: any) => ({
    student: studentLabel(studentById.get(idOf(booking.student))),
    coach: coachName(booking),
    scheduledFor: booking.startAt,
    status: demoStatusLabel(booking),
  });

  const demoColumns: DetailColumn[] = [
    { key: "student", label: "Student" },
    { key: "coach", label: "Coach" },
    { key: "scheduledFor", label: "Demo date", type: "datetime" },
    { key: "status", label: "Outcome", type: "badge" },
  ];

  addTable({
    id: "demos",
    title: "Demo classes",
    subtitle: "Every demo scheduled inside the range",
    columns: demoColumns,
    rows: demosInRange.map(demoRow),
  });
  addTable({
    id: "demosDone",
    title: "Demos delivered",
    subtitle: "Demos that actually took place",
    columns: demoColumns,
    rows: demoDone.map(demoRow),
  });
  addTable({
    id: "demosConverted",
    title: "Demos converted",
    subtitle: "Demo students who enrolled, and what they have paid so far",
    columns: [
      { key: "student", label: "Student" },
      { key: "coach", label: "Coach" },
      { key: "scheduledFor", label: "Demo date", type: "datetime" },
      { key: "plan", label: "Plan" },
      { key: "collected", label: "Collected", type: "money", align: "right" },
    ],
    rows: demoConverted.map((booking) => {
      const studentId = idOf(booking.student);
      const assignment = assignmentByStudent.get(studentId);
      return {
        ...demoRow(booking),
        plan: assignment?.plan?.name || "No plan assigned",
        collected: sum(
          scoped.filter((invoice) => idOf(invoice.student) === studentId && invoice.status === "paid"),
          (i) => i.totalAmount
        ),
      };
    }),
    totals: { collected: demoRevenue },
  });
  addTable({
    id: "demosNoShow",
    title: "Demos missed",
    subtitle: "Demos where the student did not attend",
    columns: demoColumns,
    rows: demoNoShow.map(demoRow),
  });
  addTable({
    id: "coachConversion",
    title: "Conversion rate by coach",
    subtitle: "How each coach performs at turning demos into enrolled students",
    columns: [
      { key: "coach", label: "Coach" },
      { key: "scheduled", label: "Scheduled", type: "number", align: "right" },
      { key: "done", label: "Delivered", type: "number", align: "right" },
      { key: "noShow", label: "No show", type: "number", align: "right" },
      { key: "converted", label: "Converted", type: "number", align: "right" },
      { key: "rate", label: "Conversion", type: "percent", align: "right" },
    ],
    rows: coachConversion,
    footnote: "Conversion rate is measured against demos delivered, not demos scheduled.",
  });

  /* --------------------------------------------------------- 5. retention */

  const existingStudents = (students as any[]).filter((student) => {
    if (student.accountStatus === "demo") return false;
    if (joinedAt(student).getTime() >= from.getTime()) return false;
    const left = leftAt(student);
    return !(student.isActive === false && left && left.getTime() < from.getTime());
  });
  const existingIds = new Set(existingStudents.map((student) => idOf(student)));
  const retentionInvoices = scoped.filter(
    (invoice) => existingIds.has(idOf(invoice.student)) && invoice.status !== "cancelled" && inRange(invoice.dueDate, from, to)
  );
  const retentionCollected = retentionInvoices.filter((invoice) => retentionBucket(invoice, now) === "collected");
  const retentionMissed = retentionInvoices.filter((invoice) => retentionBucket(invoice, now) === "missed");
  const retentionPending = retentionInvoices.filter((invoice) => retentionBucket(invoice, now) === "pending");
  const retentionCollectedAmount = sum(retentionCollected, (i) => i.totalAmount);
  const retentionMissedAmount = sum(retentionMissed, (i) => i.totalAmount);
  const retainedStudents = existingStudents.filter((student) => student.isActive !== false);
  const churnedExisting = existingStudents.filter((student) => student.isActive === false);

  addTable({
    id: "retentionCollected",
    title: "Retained revenue",
    subtitle: "Invoices for existing students that were paid",
    columns: [
      { key: "invoice", label: "Invoice" },
      { key: "student", label: "Student" },
      { key: "plan", label: "Plan" },
      { key: "due", label: "Due", type: "date" },
      { key: "paidAt", label: "Paid on", type: "date" },
      { key: "total", label: "Amount", type: "money", align: "right" },
    ],
    rows: retentionCollected.map(invoiceRow),
    totals: { total: retentionCollectedAmount },
  });
  addTable({
    id: "retentionMissed",
    title: "Missed revenue",
    subtitle: "Invoices for existing students that came due and were not paid",
    columns: [
      { key: "invoice", label: "Invoice" },
      { key: "student", label: "Student" },
      { key: "plan", label: "Plan" },
      { key: "due", label: "Due", type: "date" },
      { key: "total", label: "Amount", type: "money", align: "right" },
      { key: "status", label: "Status", type: "badge" },
    ],
    rows: retentionMissed.map(invoiceRow),
    totals: { total: retentionMissedAmount },
  });
  addTable({
    id: "retentionPending",
    title: "Not yet due",
    subtitle: "Invoices for existing students inside the range that have not reached their due date",
    columns: invoiceColumns,
    rows: retentionPending.map(invoiceRow),
    totals: { total: sum(retentionPending, (i) => i.totalAmount) },
  });
  addTable({
    id: "retentionStudents",
    title: "Existing student retention",
    subtitle: "Students already enrolled before this range, and whether they stayed",
    columns: [
      { key: "student", label: "Student" },
      { key: "joined", label: "Joined", type: "date" },
      { key: "plan", label: "Plan" },
      { key: "billed", label: "Billed in range", type: "money", align: "right" },
      { key: "paid", label: "Paid in range", type: "money", align: "right" },
      { key: "state", label: "Status", type: "badge" },
    ],
    rows: existingStudents.map((student) => {
      const id = idOf(student);
      const own = retentionInvoices.filter((invoice) => idOf(invoice.student) === id);
      const assignment = assignmentByStudent.get(id);
      return {
        student: studentLabel(student),
        joined: joinedAt(student),
        plan: assignment?.plan?.name || "No plan assigned",
        billed: sum(own, (i) => i.totalAmount),
        paid: sum(own.filter((invoice) => invoice.status === "paid"), (i) => i.totalAmount),
        state: student.isActive === false ? "Left" : student.isPaused ? "Paused" : "Active",
      };
    }),
  });

  /* --------------------------------------------------- 6. expected revenue */

  const monthlyAssignments = (assignments as any[]).filter((assignment) => assignment.type === "monthly");
  const creditAssignments = (assignments as any[]).filter((assignment) => assignment.type === "credits");
  const billable = (assignment: any) =>
    assignment.student &&
    assignment.student.isActive !== false &&
    assignment.student.isPaused !== true &&
    assignment.plan &&
    assignment.plan.isActive !== false;
  const monthlyExpectedRows: Record<string, any>[] = [];
  let expectedMonthly = 0;
  let expectedMonthlyCycles = 0;
  for (const assignment of monthlyAssignments) {
    if (!billable(assignment) || !planMatchesGst(assignment.plan, gst)) continue;
    const start = toDate(assignment.firstDueDate || assignment.billingStartDate);
    if (!start) continue;
    const perCycle = planGross(assignment.plan, settings);
    const dueDates = monthlyCyclesInRange(start, from, to);
    if (!dueDates.length) continue;
    expectedMonthlyCycles += dueDates.length;
    expectedMonthly += perCycle * dueDates.length;
    monthlyExpectedRows.push({
      student: studentLabel(assignment.student),
      plan: assignment.plan.name,
      cycles: dueDates.length,
      nextDue: dueDates[0],
      perCycle,
      expected: perCycle * dueDates.length,
    });
  }

  const creditSessionsByStudent = new Map<string, number>();
  for (const classroom of classrooms as any[]) {
    const sessions =
      Array.isArray(classroom.generatedSessions) && classroom.generatedSessions.length
        ? classroom.generatedSessions
        : [{ scheduledFor: classroom.classDate || classroom.startDate, status: classroom.status }];
    for (const session of sessions) {
      const startsAt = toDate(session?.scheduledFor);
      if (!startsAt || startsAt.getTime() < from.getTime() || startsAt.getTime() > to.getTime()) continue;
      const status = String(session?.status || "scheduled").toLowerCase();
      if (["cancelled", "rescheduled", "abandoned", "technical_issue"].includes(status)) continue;
      for (const student of classroom.students || []) {
        const id = idOf(student);
        creditSessionsByStudent.set(id, (creditSessionsByStudent.get(id) || 0) + 1);
      }
    }
  }

  const creditExpectedRows: Record<string, any>[] = [];
  let expectedCredits = 0;
  let expectedCreditSessions = 0;
  for (const assignment of creditAssignments) {
    if (!billable(assignment) || !planMatchesGst(assignment.plan, gst)) continue;
    const credits = Math.max(1, Number(assignment.plan.credits || 0));
    const perCredit = Math.round(planGross(assignment.plan, settings) / credits);
    const sessions = creditSessionsByStudent.get(idOf(assignment.student)) || 0;
    if (!sessions) continue;
    expectedCreditSessions += sessions;
    expectedCredits += perCredit * sessions;
    creditExpectedRows.push({
      student: studentLabel(assignment.student),
      plan: assignment.plan.name,
      balance: Number(assignment.creditBalance || 0),
      sessions,
      perCredit,
      expected: perCredit * sessions,
    });
  }

  addTable({
    id: "expectedMonthly",
    title: "Expected monthly plan revenue",
    subtitle: "Every billing cycle that falls inside the range for active monthly students",
    columns: [
      { key: "student", label: "Student" },
      { key: "plan", label: "Plan" },
      { key: "nextDue", label: "First due in range", type: "date" },
      { key: "cycles", label: "Cycles", type: "number", align: "right" },
      { key: "perCycle", label: "Per cycle", type: "money", align: "right" },
      { key: "expected", label: "Expected", type: "money", align: "right" },
    ],
    rows: monthlyExpectedRows.sort((a, b) => b.expected - a.expected),
    totals: { expected: expectedMonthly },
    footnote: pausedStudentIds.size
      ? `Inactive plans are excluded, and so are ${pausedStudentIds.size} paused student(s) worth ${(pausedOnHold / 100).toLocaleString("en-IN", { style: "currency", currency: "INR" })} - see Paused students for that breakdown.`
      : "Paused students and inactive plans are excluded.",
  });
  addTable({
    id: "expectedCredits",
    title: "Expected credit plan revenue",
    subtitle: "Scheduled classes in the range valued at each student's per-class price",
    columns: [
      { key: "student", label: "Student" },
      { key: "plan", label: "Plan" },
      { key: "balance", label: "Credits left", type: "number", align: "right" },
      { key: "sessions", label: "Classes scheduled", type: "number", align: "right" },
      { key: "perCredit", label: "Per class", type: "money", align: "right" },
      { key: "expected", label: "Expected", type: "money", align: "right" },
    ],
    rows: creditExpectedRows.sort((a, b) => b.expected - a.expected),
    totals: { expected: expectedCredits },
    footnote: "Assumes every scheduled class is delivered and consumes one credit.",
  });

  /* -------------------------------------------------------- 7. operations */

  const activeStudents = (students as any[]).filter(
    (student) => student.isActive !== false && student.accountStatus !== "demo"
  );
  const lowCredit = creditAssignments.filter(
    (assignment) => Number(assignment.creditBalance || 0) <= Number(settings.lowCreditThreshold || 1)
  );
  const unassigned = activeStudents.filter((student) => !assignmentByStudent.has(idOf(student)));

  const studentColumns: DetailColumn[] = [
    { key: "student", label: "Student" },
    { key: "username", label: "Student ID" },
    { key: "plan", label: "Plan" },
    { key: "joined", label: "Joined", type: "date" },
    { key: "state", label: "Status", type: "badge" },
  ];
  const studentRow = (student: any) => {
    const assignment = assignmentByStudent.get(idOf(student));
    return {
      student: studentLabel(student),
      username: student.username || "-",
      plan: assignment?.plan?.name || "No plan assigned",
      joined: joinedAt(student),
      state: student.isActive === false ? "Left" : student.isPaused ? "Paused" : "Active",
    };
  };

  addTable({
    id: "activeStudents",
    title: "Active students",
    subtitle: "Enrolled students with a live account",
    columns: studentColumns,
    rows: activeStudents.map(studentRow),
  });
  addTable({
    id: "creditStudents",
    title: "Credit plan students",
    subtitle: "Students billed per class from a credit balance",
    columns: [
      { key: "student", label: "Student" },
      { key: "plan", label: "Plan" },
      { key: "balance", label: "Credits left", type: "number", align: "right" },
      { key: "purchased", label: "Purchased", type: "number", align: "right" },
      { key: "consumed", label: "Consumed", type: "number", align: "right" },
    ],
    rows: creditAssignments.map((assignment) => ({
      student: studentLabel(assignment.student),
      plan: assignment.plan?.name || "-",
      balance: Number(assignment.creditBalance || 0),
      purchased: Number(assignment.totalCreditsPurchased || 0),
      consumed: Number(assignment.totalCreditsConsumed || 0),
    })),
  });
  addTable({
    id: "lowCredit",
    title: "Students running out of credits",
    subtitle: `Credit balance at or below ${settings.lowCreditThreshold || 1}`,
    columns: [
      { key: "student", label: "Student" },
      { key: "plan", label: "Plan" },
      { key: "balance", label: "Credits left", type: "number", align: "right" },
      { key: "rechargeValue", label: "Recharge value", type: "money", align: "right" },
    ],
    rows: lowCredit.map((assignment) => ({
      student: studentLabel(assignment.student),
      plan: assignment.plan?.name || "-",
      balance: Number(assignment.creditBalance || 0),
      rechargeValue: planGross(assignment.plan, settings),
    })),
  });
  addTable({
    id: "monthlyStudents",
    title: "Monthly plan students",
    subtitle: "Students on a recurring monthly fee",
    columns: [
      { key: "student", label: "Student" },
      { key: "plan", label: "Plan" },
      { key: "perCycle", label: "Per month", type: "money", align: "right" },
      { key: "since", label: "Billing since", type: "date" },
    ],
    rows: monthlyAssignments.map((assignment) => ({
      student: studentLabel(assignment.student),
      plan: assignment.plan?.name || "-",
      perCycle: planGross(assignment.plan, settings),
      since: assignment.billingStartDate,
    })),
  });
  addTable({
    id: "unassignedStudents",
    title: "Students without a fee plan",
    subtitle: "Active students who are not being billed at all",
    columns: studentColumns,
    rows: unassigned.map(studentRow),
  });

  /* -------------------------------------------------------------- payload */

  const kpis = {
    collected,
    collectedCount: paidInRange.length,
    gstCollected,
    gstInvoiceCount: gstInvoicesPaid.length,
    gstInvoiceCollected,
    nonGstCollected,
    nonGstInvoiceCount: nonGstInvoicesPaid.length,
    netCollected: collected - gstCollected,
    lateFeeCollected,
    lateFeeCount: paidInRange.filter((invoice) => Number(invoice.lateFee || 0) > 0).length,
    discountValue,
    discountCount: discounted.length,
    outstanding: sum(outstanding, (i) => i.totalAmount),
    outstandingCount: outstanding.length,
    dueSoon: sum(dueSoon, (i) => i.totalAmount),
    dueSoonCount: dueSoon.length,
    issuedValue: sum(issuedInRange, (i) => i.totalAmount),
    issuedCount: issuedInRange.length,
    deletedInvoices: (deletedInvoices as any[]).length,

    newStudents: newStudents.length,
    newStudentBilled,
    newStudentCollected,
    newStudentRecurring,

    leftStudents: leftStudents.length,
    churnRecurringLost,
    churnUnpaid,
    churnLifetime,
    netStudentGrowth: newStudents.length - leftStudents.length,
    netRecurringGrowth: newStudentRecurring - churnRecurringLost,

    pausedStudents: pausesInRange.length,
    pausedActive: pausesActive.length,
    pausedReturning: pausesReturning.length,
    pausedOnHold,
    pausedVoidedValue,
    pausedVoidedCount,
    pausedUnbilledValue,
    revenueLostTotal: churnRecurringLost + pausedOnHold,

    demosScheduled: demosInRange.length,
    demosDone: demoDone.length,
    demosConverted: demoConverted.length,
    demosNoShow: demoNoShow.length,
    demoConversionRate: rate(demoConverted.length, demoDone.length),
    demoRevenue,
    coachCount: coachConversion.length,

    retentionStudents: existingStudents.length,
    retentionInvoices: retentionInvoices.length,
    retentionCollectedCount: retentionCollected.length,
    retentionMissedCount: retentionMissed.length,
    retentionPendingCount: retentionPending.length,
    retentionCollectedAmount,
    retentionMissedAmount,
    retentionPendingAmount: sum(retentionPending, (i) => i.totalAmount),
    retentionRateByValue: rate(retentionCollectedAmount, retentionCollectedAmount + retentionMissedAmount),
    retentionRateByCount: rate(retentionCollected.length, retentionCollected.length + retentionMissed.length),
    studentRetentionRate: rate(retainedStudents.length, existingStudents.length),
    retainedStudents: retainedStudents.length,
    churnedExisting: churnedExisting.length,

    expectedMonthly,
    expectedMonthlyCycles,
    expectedMonthlyStudents: monthlyExpectedRows.length,
    expectedCredits,
    expectedCreditSessions,
    expectedCreditStudents: creditExpectedRows.length,
    expectedTotal: expectedMonthly + expectedCredits,

    activeStudents: activeStudents.length,
    creditStudents: creditAssignments.length,
    monthlyStudents: monthlyAssignments.length,
    lowCreditStudents: lowCredit.length,
    unassignedStudents: unassigned.length,
  };

  return {
    generatedAt: new Date().toISOString(),
    range: { from: dateKey(from), to: dateKey(to), label: rangeLabel(from, to) },
    gst,
    kpis,
    coachConversion,
    tables,
  };
}
