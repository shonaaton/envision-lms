import { Types } from "mongoose";

import { recordActivity } from "@/lib/activity";
import { createInvoice } from "@/lib/fees";
import { syncClassroomSessionInstances } from "@/lib/classroomSessionInstances";
import { Batch } from "@/models/Batch";
import { Classroom } from "@/models/Classroom";
import { FeeAssignment, FeePlan, Invoice, Notification } from "@/models/Fee";
import { StudentPause } from "@/models/StudentPause";
import { User } from "@/models/User";

// Invoices in these states have not been settled, so a pause can still void them.
const VOIDABLE_INVOICE_STATUSES = ["draft", "unpaid", "overdue"];

export const pausedStudentMessage =
  "Your classes are paused at the moment. Fees are not being billed for the paused period - the academy will reinstate your account on the agreed restart date.";

export type PauseActor = {
  id: string;
  name?: string;
  role?: string;
};

function idOf(value: any) {
  return String(value?._id || value || "");
}

function toDate(value: any) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value);
  const raw = String(value);
  // A plain "YYYY-MM-DD" from a date input is parsed as UTC midnight by the
  // Date constructor, which lands on the previous day west of UTC. Read the
  // parts directly so the calendar day the admin picked is the day we store.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Start of the day - pauses and restarts are whole-day decisions. */
export function pauseDayStart(value: any) {
  const date = toDate(value);
  if (!date) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * End of the day, so "paused till 30 Nov" includes 30 Nov. This is also the
 * shape every invoice due date takes in `fees.ts` (`monthlyDueDate` ends the day
 * the same way), so a restart date lines up exactly with the monthly cycle that
 * `ensureMonthlyInvoices` later generates from it.
 */
export function pauseDayEnd(value: any) {
  const date = toDate(value);
  if (!date) return null;
  date.setHours(23, 59, 59, 999);
  return date;
}

/** True while a pause record is live and its end date has not passed. */
export function isPauseWindowOpen(pause: any, now = new Date()) {
  if (!pause || pause.status !== "active") return false;
  const until = toDate(pause.pausedUntil);
  return !until || until.getTime() >= now.getTime();
}

export async function getActivePause(studentId: string) {
  if (!Types.ObjectId.isValid(studentId)) return null;
  return StudentPause.findOne({ student: new Types.ObjectId(studentId), status: "active" }).lean();
}

export async function isStudentPaused(studentId: string) {
  if (!Types.ObjectId.isValid(studentId)) return false;
  return Boolean(await StudentPause.exists({ student: new Types.ObjectId(studentId), status: "active" }));
}

/** Ids of every currently paused student - for filtering rosters and billing runs. */
export async function pausedStudentIds() {
  const rows: any[] = await StudentPause.find({ status: "active" }).select("student").lean();
  return new Set(rows.map((row) => idOf(row.student)).filter(Boolean));
}

/**
 * Take the student out of every classroom session that has not happened yet.
 * Batch membership and the classroom roster stay untouched, so resuming only has
 * to put the student back into the sessions ahead of them.
 */
async function removeFromFutureSessions(studentId: string, fromDate: Date) {
  const classrooms: any[] = await Classroom.find({
    students: new Types.ObjectId(studentId),
    isActive: { $ne: false },
    isSessionInstance: { $ne: true },
  });
  let updated = 0;

  for (const classroom of classrooms) {
    let changed = false;
    (classroom.generatedSessions || []).forEach((session: any) => {
      const startsAt = toDate(session?.scheduledFor);
      if (!startsAt || startsAt.getTime() < fromDate.getTime() || session?.actualEndedAt) return;
      const roster = (session.students || []).map(idOf);
      if (!roster.includes(studentId)) return;
      session.students = roster.filter((id: string) => id !== studentId);
      changed = true;
    });
    if (changed) {
      await classroom.save();
      await syncClassroomSessionInstances(idOf(classroom._id)).catch(() => undefined);
      updated += 1;
    }
  }
  return updated;
}

/**
 * Put the student back on the roster of every session from `fromDate` onwards in
 * the classrooms attached to the batch they are returning to.
 */
async function restoreToFutureSessions(studentId: string, batchId: string, fromDate: Date) {
  if (!batchId || !Types.ObjectId.isValid(batchId)) return 0;
  const classrooms: any[] = await Classroom.find({
    batches: new Types.ObjectId(batchId),
    isActive: { $ne: false },
    isSessionInstance: { $ne: true },
    status: { $nin: ["completed", "cancelled"] },
  });
  let updated = 0;

  for (const classroom of classrooms) {
    let changed = false;
    const roster = (classroom.students || []).map(idOf);
    if (!roster.includes(studentId)) {
      classroom.students = [...roster, studentId];
      changed = true;
    }
    (classroom.generatedSessions || []).forEach((session: any) => {
      const startsAt = toDate(session?.scheduledFor);
      if (!startsAt || startsAt.getTime() < fromDate.getTime() || session?.actualEndedAt) return;
      const sessionRoster = (session.students || []).map(idOf);
      if (sessionRoster.includes(studentId)) return;
      session.students = [...sessionRoster, studentId];
      changed = true;
    });
    if (changed) {
      await classroom.save();
      await syncClassroomSessionInstances(idOf(classroom._id)).catch(() => undefined);
      updated += 1;
    }
  }
  return updated;
}

/**
 * Cancel every unsettled invoice that falls on or after the pause date. Paid
 * invoices and dues already outstanding before the pause are left alone - the
 * student still owes those.
 */
async function voidUpcomingInvoices(studentId: string, fromDate: Date, actor?: PauseActor) {
  const invoices: any[] = await Invoice.find({
    student: new Types.ObjectId(studentId),
    status: { $in: VOIDABLE_INVOICE_STATUSES },
    dueDate: { $gte: fromDate },
  });

  const voided: any[] = [];
  for (const invoice of invoices) {
    const previousStatus = String(invoice.status || "");
    invoice.status = "cancelled";
    invoice.notes = [invoice.notes, `Voided on ${new Date().toLocaleDateString("en-IN")} because the student was paused from classes.`]
      .filter(Boolean)
      .join(" ");
    await invoice.save();
    voided.push({
      invoice: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      title: invoice.title,
      dueDate: invoice.dueDate,
      totalAmount: invoice.totalAmount,
      previousStatus,
    });
    await recordActivity({
      actor: actor?.id,
      targetUser: studentId,
      type: "fees.invoice.cancelled",
      label: `Voided invoice ${invoice.invoiceNumber} after pausing the student`,
      entityType: "Invoice",
      entityId: invoice._id.toString(),
      metadata: { invoiceNumber: invoice.invoiceNumber, previousStatus, source: "student_pause" },
    });
  }
  return voided;
}

/** Restore invoices voided by a pause - used when a pause is cancelled by mistake. */
async function restoreVoidedInvoices(pause: any) {
  let restored = 0;
  for (const entry of pause.voidedInvoices || []) {
    const invoice: any = await Invoice.findById(entry.invoice);
    if (!invoice || invoice.status !== "cancelled") continue;
    invoice.status = entry.previousStatus || "unpaid";
    await invoice.save();
    restored += 1;
  }
  return restored;
}

export type PauseStudentInput = {
  studentId: string;
  batchId?: string;
  pausedFrom?: string | Date;
  pausedUntil: string | Date;
  expectedRestartDate?: string | Date;
  reason?: string;
  actor: PauseActor;
};

export async function pauseStudent(input: PauseStudentInput) {
  const studentId = String(input.studentId || "");
  if (!Types.ObjectId.isValid(studentId)) throw new Error("Select a valid student.");

  const student: any = await User.findOne({ _id: studentId, role: "student" }).select("name email batches isActive").lean();
  if (!student) throw new Error("Student not found.");
  if (student.isActive === false) throw new Error("This student account is deactivated. Reactivate the account before pausing it from a batch.");
  if (await StudentPause.exists({ student: new Types.ObjectId(studentId), status: "active" })) {
    throw new Error("This student is already paused. Resume the existing pause before starting a new one.");
  }

  const pausedFrom = pauseDayStart(input.pausedFrom) || pauseDayStart(new Date())!;
  const pausedUntil = pauseDayEnd(input.pausedUntil);
  if (!pausedUntil) throw new Error("Enter the date the pause runs until.");
  if (pausedUntil.getTime() < pausedFrom.getTime()) throw new Error("The pause end date cannot be before the pause start date.");
  const expectedRestartDate = pauseDayStart(input.expectedRestartDate) || null;

  const batchId = input.batchId && Types.ObjectId.isValid(input.batchId)
    ? input.batchId
    : idOf((student.batches || [])[0]);
  const batch: any = batchId && Types.ObjectId.isValid(batchId) ? await Batch.findById(batchId).select("name").lean() : null;

  const assignment: any = await FeeAssignment.findOne({ student: new Types.ObjectId(studentId) }).populate("plan").lean();
  const voidedInvoices = await voidUpcomingInvoices(studentId, pausedFrom, input.actor);

  const pause: any = await StudentPause.create({
    student: new Types.ObjectId(studentId),
    batch: batch?._id,
    batchName: batch?.name || "",
    status: "active",
    pausedFrom,
    pausedUntil,
    expectedRestartDate,
    reason: input.reason?.trim() || "",
    pausedAt: new Date(),
    pausedBy: input.actor?.id,
    pausedByName: input.actor?.name || "",
    pausedByRole: input.actor?.role || "",
    voidedInvoices,
    feeSnapshot: assignment
      ? {
          assignment: assignment._id,
          plan: assignment.plan?._id,
          planName: assignment.plan?.name || "",
          planType: assignment.type,
          billingStartDate: assignment.billingStartDate,
          firstDueDate: assignment.firstDueDate,
        }
      : undefined,
  });

  await User.updateOne(
    { _id: studentId },
    { $set: { isPaused: true, pausedUntil, pauseExpectedRestartDate: expectedRestartDate, pauseRecord: pause._id } }
  );

  const sessionsUpdated = await removeFromFutureSessions(studentId, pausedFrom);

  await Notification.create({
    user: studentId,
    type: "batch_pause",
    title: "Your classes are paused",
    message: `Your classes are paused until ${pausedUntil.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}. No fees will be billed for the paused period.`,
    metadata: { pause: pause._id.toString(), pausedUntil, expectedRestartDate },
  }).catch(() => undefined);

  await recordActivity({
    actor: input.actor?.id,
    targetUser: studentId,
    type: "student.pause.started",
    label: `Paused ${student.name} from ${batch?.name || "classes"} until ${pausedUntil.toLocaleDateString("en-IN")}`,
    entityType: "StudentPause",
    entityId: pause._id.toString(),
    metadata: {
      batch: idOf(batch?._id),
      batchName: batch?.name || "",
      pausedFrom,
      pausedUntil,
      expectedRestartDate,
      voidedInvoices: voidedInvoices.length,
      classroomsUpdated: sessionsUpdated,
      reason: input.reason || "",
    },
  });

  return { pause, voidedInvoices, classroomsUpdated: sessionsUpdated };
}

export type UpdatePauseInput = {
  pauseId: string;
  pausedUntil?: string | Date;
  expectedRestartDate?: string | Date;
  reason?: string;
  actor: PauseActor;
};

export async function updatePause(input: UpdatePauseInput) {
  const pause: any = await StudentPause.findById(input.pauseId);
  if (!pause) throw new Error("Pause record not found.");
  if (pause.status !== "active") throw new Error("Only a running pause can be edited.");

  if (input.pausedUntil !== undefined) {
    const pausedUntil = pauseDayEnd(input.pausedUntil);
    if (!pausedUntil) throw new Error("Enter a valid pause end date.");
    if (pausedUntil.getTime() < new Date(pause.pausedFrom).getTime()) {
      throw new Error("The pause end date cannot be before the pause start date.");
    }
    pause.pausedUntil = pausedUntil;
  }
  if (input.expectedRestartDate !== undefined) {
    pause.expectedRestartDate = pauseDayStart(input.expectedRestartDate);
  }
  if (input.reason !== undefined) pause.reason = input.reason.trim();
  await pause.save();

  await User.updateOne(
    { _id: pause.student },
    { $set: { pausedUntil: pause.pausedUntil, pauseExpectedRestartDate: pause.expectedRestartDate || null } }
  );

  await recordActivity({
    actor: input.actor?.id,
    targetUser: idOf(pause.student),
    type: "student.pause.updated",
    label: `Updated pause dates for ${pause.batchName || "student"}`,
    entityType: "StudentPause",
    entityId: pause._id.toString(),
    metadata: { pausedUntil: pause.pausedUntil, expectedRestartDate: pause.expectedRestartDate },
  });
  return pause;
}

export type ResumeStudentInput = {
  pauseId: string;
  batchId?: string;
  nextInvoiceDate: string | Date;
  restartDate?: string | Date;
  note?: string;
  actor: PauseActor;
};

/**
 * Put a paused student back into a batch and restart billing. The caller decides
 * the date of the first invoice after the break; the fee plan's own cycle runs on
 * from there, so every later invoice lands on that day of the month.
 */
export async function resumeStudent(input: ResumeStudentInput) {
  const pause: any = await StudentPause.findById(input.pauseId);
  if (!pause) throw new Error("Pause record not found.");
  if (pause.status !== "active") throw new Error("This pause has already been closed.");

  const studentId = idOf(pause.student);
  const student: any = await User.findOne({ _id: studentId, role: "student" }).select("name batches isActive").lean();
  if (!student) throw new Error("Student not found.");

  const nextInvoiceDate = pauseDayEnd(input.nextInvoiceDate);
  if (!nextInvoiceDate) throw new Error("Choose the date of the first invoice after the restart.");
  const restartDate = pauseDayStart(input.restartDate) || pauseDayStart(new Date())!;

  const targetBatchId = input.batchId && Types.ObjectId.isValid(input.batchId) ? input.batchId : idOf(pause.batch);
  const targetBatch: any = targetBatchId && Types.ObjectId.isValid(targetBatchId)
    ? await Batch.findById(targetBatchId).select("name students studentEnrollments").lean()
    : null;
  if (targetBatchId && !targetBatch) throw new Error("The selected batch no longer exists.");

  // Move the student across batches when the return batch is a different one.
  const previousBatchId = idOf(pause.batch);
  if (targetBatch) {
    if (previousBatchId && previousBatchId !== targetBatchId) {
      await Batch.updateOne(
        { _id: previousBatchId },
        { $pull: { students: new Types.ObjectId(studentId), studentEnrollments: { student: new Types.ObjectId(studentId) } } }
      );
      await User.updateOne({ _id: studentId }, { $pull: { batches: new Types.ObjectId(previousBatchId) } });
    }
    await Batch.updateOne({ _id: targetBatch._id }, { $addToSet: { students: new Types.ObjectId(studentId) } });
    const alreadyEnrolled = (targetBatch.studentEnrollments || []).some((entry: any) => idOf(entry?.student) === studentId);
    if (!alreadyEnrolled) {
      await Batch.updateOne(
        { _id: targetBatch._id },
        { $push: { studentEnrollments: { student: new Types.ObjectId(studentId), enrolledAt: restartDate } } }
      );
    }
    await User.updateOne({ _id: studentId }, { $addToSet: { batches: targetBatch._id } });
  }

  await User.updateOne(
    { _id: studentId },
    { $set: { isPaused: false }, $unset: { pausedUntil: 1, pauseExpectedRestartDate: 1, pauseRecord: 1 } }
  );

  const classroomsUpdated = targetBatch ? await restoreToFutureSessions(studentId, idOf(targetBatch._id), restartDate) : 0;

  // Restart the billing cycle from the chosen date and raise that first invoice.
  const invoice: any = await restartBilling({ studentId, studentName: student.name, nextInvoiceDate, actor: input.actor });

  pause.status = "resumed";
  pause.resumedAt = new Date();
  pause.resumedBy = input.actor?.id;
  pause.resumedByName = input.actor?.name || "";
  pause.resumeBatch = targetBatch?._id;
  pause.resumeBatchName = targetBatch?.name || "";
  pause.nextInvoiceDate = nextInvoiceDate;
  pause.resumeInvoice = invoice?._id;
  pause.resumeInvoiceNumber = invoice?.invoiceNumber || "";
  pause.resumeNote = input.note?.trim() || "";
  await pause.save();

  await Notification.create({
    user: studentId,
    type: "batch_pause",
    title: "Welcome back - your classes have restarted",
    message: `You are back in ${targetBatch?.name || "your batch"}. Your next invoice is dated ${nextInvoiceDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.`,
    metadata: { pause: pause._id.toString(), batch: idOf(targetBatch?._id), nextInvoiceDate },
  }).catch(() => undefined);

  await recordActivity({
    actor: input.actor?.id,
    targetUser: studentId,
    type: "student.pause.resumed",
    label: `Reinstated ${student.name} into ${targetBatch?.name || "classes"}`,
    entityType: "StudentPause",
    entityId: pause._id.toString(),
    metadata: {
      batch: idOf(targetBatch?._id),
      batchName: targetBatch?.name || "",
      previousBatch: previousBatchId,
      batchChanged: Boolean(previousBatchId && targetBatchId && previousBatchId !== targetBatchId),
      restartDate,
      nextInvoiceDate,
      invoice: invoice?._id?.toString?.() || "",
      invoiceNumber: invoice?.invoiceNumber || "",
      classroomsUpdated,
      note: input.note || "",
    },
  });

  return { pause, invoice, classroomsUpdated };
}

/**
 * Re-anchor the student's fee plan to the restart date and raise the first
 * invoice of the new cycle. Monthly plans bill from that date onwards; credit
 * plans get a fresh recharge invoice due on it.
 */
async function restartBilling(input: { studentId: string; studentName?: string; nextInvoiceDate: Date; actor: PauseActor }) {
  const assignment: any = await FeeAssignment.findOne({ student: new Types.ObjectId(input.studentId) });
  if (!assignment) return null;
  const plan: any = await FeePlan.findById(assignment.plan).lean();
  if (!plan) return null;

  assignment.billingStartDate = input.nextInvoiceDate;
  assignment.firstDueDate = input.nextInvoiceDate;
  assignment.history = [
    ...(assignment.history || []),
    `${new Date().toISOString()} | ${plan.name} | ${assignment.type} | Billing restarted after pause, first invoice ${input.nextInvoiceDate.toLocaleDateString("en-IN")}`,
  ];
  await assignment.save();

  const existing = await Invoice.exists({
    student: new Types.ObjectId(input.studentId),
    assignment: assignment._id,
    dueDate: input.nextInvoiceDate,
    status: { $ne: "cancelled" },
  });
  if (existing) return null;

  const isCredits = assignment.type === "credits";
  return createInvoice({
    student: input.studentId,
    plan: plan._id.toString(),
    assignment: assignment._id.toString(),
    type: isCredits ? "credits" : "monthly",
    title: isCredits
      ? `${plan.name} credit recharge`
      : `${plan.name} - ${input.nextInvoiceDate.toLocaleString("en-IN", { month: "long", year: "numeric" })}`,
    amount: Number(plan.amount || 0),
    issueDate: input.nextInvoiceDate,
    dueDate: input.nextInvoiceDate,
    credits: isCredits ? Number(plan.credits || 0) : 0,
    notes: "Generated when the student was reinstated after a pause",
    invoiceMode: plan.gstMode || "non_gst",
    gstPercentage: Number(plan.gstPercentage || 0),
    activity: {
      actor: input.actor?.id,
      source: "manual_admin",
      label: `Generated the first invoice after reinstating ${input.studentName || "the student"}`,
    },
  });
}

export type CancelPauseInput = {
  pauseId: string;
  reason?: string;
  restoreInvoices?: boolean;
  actor: PauseActor;
};

/** Undo a pause that should not have been recorded, without restarting billing. */
export async function cancelPause(input: CancelPauseInput) {
  const pause: any = await StudentPause.findById(input.pauseId);
  if (!pause) throw new Error("Pause record not found.");
  if (pause.status !== "active") throw new Error("This pause has already been closed.");

  const studentId = idOf(pause.student);
  const restored = input.restoreInvoices === false ? 0 : await restoreVoidedInvoices(pause);
  const restoreFrom = pauseDayStart(new Date())!;

  await User.updateOne(
    { _id: studentId },
    { $set: { isPaused: false }, $unset: { pausedUntil: 1, pauseExpectedRestartDate: 1, pauseRecord: 1 } }
  );
  const classroomsUpdated = pause.batch ? await restoreToFutureSessions(studentId, idOf(pause.batch), restoreFrom) : 0;

  pause.status = "cancelled";
  pause.cancelledAt = new Date();
  pause.cancelledBy = input.actor?.id;
  pause.cancelledByName = input.actor?.name || "";
  pause.cancelReason = input.reason?.trim() || "";
  await pause.save();

  await recordActivity({
    actor: input.actor?.id,
    targetUser: studentId,
    type: "student.pause.cancelled",
    label: `Cancelled the pause for ${pause.batchName || "student"}`,
    entityType: "StudentPause",
    entityId: pause._id.toString(),
    metadata: { invoicesRestored: restored, classroomsUpdated, reason: input.reason || "" },
  });

  return { pause, invoicesRestored: restored, classroomsUpdated };
}
