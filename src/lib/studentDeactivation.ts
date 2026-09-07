import { Types } from "mongoose";

import { recordActivity } from "@/lib/activity";
import { syncClassroomSessionInstances } from "@/lib/classroomSessionInstances";
import { Batch } from "@/models/Batch";
import { Classroom } from "@/models/Classroom";
import { Invoice, Notification } from "@/models/Fee";
import { User } from "@/models/User";

/**
 * Deactivating a student account is not only a login change: the classes that
 * existed for that student have to stop existing too. This module closes the
 * classrooms and batches the student was the last active member of, voids the
 * invoices that were still ahead of them, and keeps enough of a trail to undo
 * all of it if the account is switched back on.
 *
 * Rosters are deliberately left untouched. Membership is history - attendance,
 * homework and reports all read it - so "is this batch still running" is decided
 * by whether any active student remains, never by deleting the student from it.
 */

export const DEACTIVATION_CLOSURE_REASON = "student_deactivated";

/** Invoices in these states have not been settled, so a deactivation can void them. */
const VOIDABLE_INVOICE_STATUSES = ["draft", "unpaid", "overdue"];

/** Sessions in these states have not happened yet, so closing a classroom cancels them. */
const OPEN_SESSION_STATUSES = ["scheduled", "ongoing", "in_progress"];

export type DeactivationActor = {
  id?: string;
  name?: string;
  role?: string;
};

export type ClosedGroupSummary = {
  id: string;
  name: string;
  coach: string;
  sessionsCancelled?: number;
};

export type DeactivationSummary = {
  student: string;
  studentName: string;
  invoicesVoided: number;
  classroomsClosed: ClosedGroupSummary[];
  batchesClosed: ClosedGroupSummary[];
};

export type ReactivationSummary = {
  student: string;
  studentName: string;
  invoicesRestored: number;
  classroomsReopened: ClosedGroupSummary[];
  batchesReopened: ClosedGroupSummary[];
};

function idOf(value: any) {
  return String(value?._id || value || "");
}

function dayStart(value: Date = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Whether a group closes when this student leaves it: only if the student was
 * actually in it and nobody active is left behind. Kept pure so the rule can be
 * read and tested on its own - it is the one decision the whole module turns on.
 */
export function shouldCloseGroup(roster: string[], studentId: string, activeStudentIdSet: Set<string>) {
  const members = roster.filter(Boolean);
  if (!members.includes(studentId)) return false;
  return !members.some((id) => id !== studentId && activeStudentIdSet.has(id));
}

/** Of the given ids, the ones belonging to an account that is still switched on. */
async function activeStudentIds(ids: string[]) {
  const unique = Array.from(new Set(ids.filter((id) => Types.ObjectId.isValid(id))));
  if (!unique.length) return new Set<string>();
  const rows: any[] = await User.find({ _id: { $in: unique }, isActive: { $ne: false } }).select("_id").lean();
  return new Set(rows.map((row) => idOf(row._id)));
}

/**
 * Void every unsettled invoice dated on or after the deactivation. Dues that
 * were already outstanding before it are left alone - the academy is still owed
 * those, and wiping them would quietly erase real receivables.
 */
async function voidUpcomingInvoices(studentId: string, fromDate: Date, actor?: DeactivationActor) {
  const invoices: any[] = await Invoice.find({
    student: new Types.ObjectId(studentId),
    status: { $in: VOIDABLE_INVOICE_STATUSES },
    dueDate: { $gte: fromDate },
  });

  for (const invoice of invoices) {
    const previousStatus = String(invoice.status || "");
    invoice.status = "cancelled";
    invoice.cancellationReason = DEACTIVATION_CLOSURE_REASON;
    invoice.cancellationPreviousStatus = previousStatus;
    invoice.notes = [invoice.notes, `Voided on ${new Date().toLocaleDateString("en-IN")} because the student account was deactivated.`]
      .filter(Boolean)
      .join(" ");
    await invoice.save();
    await recordActivity({
      actor: actor?.id,
      targetUser: studentId,
      type: "fees.invoice.cancelled",
      label: `Voided invoice ${invoice.invoiceNumber || ""} after deactivating the student`.trim(),
      entityType: "Invoice",
      entityId: invoice._id.toString(),
      metadata: { invoiceNumber: invoice.invoiceNumber, previousStatus, source: DEACTIVATION_CLOSURE_REASON },
    });
  }
  return invoices.length;
}

/**
 * Put back the invoices a deactivation voided, but only the ones still ahead of
 * today. A month the student spent deactivated was never taught, so its invoice
 * stays cancelled.
 */
async function restoreVoidedInvoices(studentId: string, fromDate: Date, actor?: DeactivationActor) {
  const invoices: any[] = await Invoice.find({
    student: new Types.ObjectId(studentId),
    status: "cancelled",
    cancellationReason: DEACTIVATION_CLOSURE_REASON,
    dueDate: { $gte: fromDate },
  });

  for (const invoice of invoices) {
    invoice.status = invoice.cancellationPreviousStatus || "unpaid";
    invoice.cancellationReason = undefined;
    invoice.cancellationPreviousStatus = undefined;
    invoice.notes = [invoice.notes, `Reinstated on ${new Date().toLocaleDateString("en-IN")} because the student account was reactivated.`]
      .filter(Boolean)
      .join(" ");
    await invoice.save();
    await recordActivity({
      actor: actor?.id,
      targetUser: studentId,
      type: "fees.invoice.restored",
      label: `Reinstated invoice ${invoice.invoiceNumber || ""} after reactivating the student`.trim(),
      entityType: "Invoice",
      entityId: invoice._id.toString(),
      metadata: { invoiceNumber: invoice.invoiceNumber, status: invoice.status, source: DEACTIVATION_CLOSURE_REASON },
    });
  }
  return invoices.length;
}

/**
 * Close every classroom the student was the last active member of. A classroom
 * that still has another active student keeps running - only the empty ones are
 * switched off, and their remaining classes are cancelled with them.
 */
async function closeEmptyClassrooms(studentId: string, actor?: DeactivationActor) {
  const sid = new Types.ObjectId(studentId);
  // The student reaches a classroom either directly or through a batch it is
  // attached to, and the two can disagree when someone joined the batch after
  // the classroom was built. Both routes are checked.
  const studentBatches: any[] = await Batch.find({ students: sid }).select("_id students").lean();
  const classrooms: any[] = await Classroom.find({
    $or: [{ students: sid }, ...(studentBatches.length ? [{ batches: { $in: studentBatches.map((batch: any) => batch._id) } }] : [])],
    isActive: { $ne: false },
    isSessionInstance: { $ne: true },
  });
  if (!classrooms.length) return [] as ClosedGroupSummary[];

  // Every batch a candidate classroom is attached to, so the roster used for the
  // "anyone left?" test is the full one, not just the stored student list.
  const batchIds = Array.from(new Set(classrooms.flatMap((classroom) => (classroom.batches || []).map(idOf)).filter(Boolean)));
  const batchRosters: any[] = batchIds.length
    ? await Batch.find({ _id: { $in: batchIds } }).select("_id students").lean()
    : [];
  const rosterByBatch = new Map<string, string[]>(
    batchRosters.map((batch: any) => [idOf(batch._id), (batch.students || []).map(idOf)])
  );
  const rosterOf = (classroom: any) =>
    Array.from(
      new Set([
        ...(classroom.students || []).map(idOf),
        ...(classroom.batches || []).flatMap((batch: any) => rosterByBatch.get(idOf(batch)) || []),
      ])
    ).filter(Boolean);

  const otherStudentIds = classrooms.flatMap((classroom) => rosterOf(classroom).filter((id: string) => id !== studentId));
  const stillActive = await activeStudentIds(otherStudentIds);

  const now = new Date();
  const closed: ClosedGroupSummary[] = [];
  for (const classroom of classrooms) {
    // A classroom the student never belonged to is left alone even if one of its
    // batches matched - only groups this student was part of can close for them.
    if (!shouldCloseGroup(rosterOf(classroom), studentId, stillActive)) continue;

    let sessionsCancelled = 0;
    (classroom.generatedSessions || []).forEach((session: any) => {
      const scheduledFor = session?.scheduledFor ? new Date(session.scheduledFor) : null;
      const status = String(session?.status || "scheduled").toLowerCase();
      if (!scheduledFor || session?.actualEndedAt || !OPEN_SESSION_STATUSES.includes(status)) return;
      if (scheduledFor.getTime() < now.getTime()) return;
      session.status = "cancelled";
      session.summary = { ...(session.summary || {}), closedByStudentDeactivation: true, previousStatus: status };
      sessionsCancelled += 1;
    });

    classroom.previousStatus = String(classroom.status || "scheduled");
    if (classroom.status !== "completed") classroom.status = "cancelled";
    classroom.isActive = false;
    classroom.closedAt = now;
    classroom.closedReason = DEACTIVATION_CLOSURE_REASON;
    classroom.closedBy = actor?.id && Types.ObjectId.isValid(actor.id) ? new Types.ObjectId(actor.id) : undefined;
    const closedFor = new Set<string>((classroom.closedForStudents || []).map(idOf));
    closedFor.add(studentId);
    classroom.closedForStudents = Array.from(closedFor).map((id) => new Types.ObjectId(id));
    await classroom.save();
    await syncClassroomSessionInstances(idOf(classroom._id)).catch(() => undefined);

    closed.push({
      id: idOf(classroom._id),
      name: String(classroom.title || "Classroom"),
      coach: idOf(classroom.coach || classroom.instructor),
      sessionsCancelled,
    });
    await recordActivity({
      actor: actor?.id,
      targetUser: studentId,
      type: "classroom.closed",
      label: `Closed ${classroom.title} because its last active student was deactivated`,
      entityType: "Classroom",
      entityId: idOf(classroom._id),
      metadata: { reason: DEACTIVATION_CLOSURE_REASON, student: studentId, sessionsCancelled, coach: idOf(classroom.coach || classroom.instructor) },
    });
  }
  return closed;
}

/** Close every batch the student was the last active member of. */
async function closeEmptyBatches(studentId: string, actor?: DeactivationActor) {
  const batches: any[] = await Batch.find({
    students: new Types.ObjectId(studentId),
    isActive: { $ne: false },
  });
  if (!batches.length) return [] as ClosedGroupSummary[];

  const otherStudentIds = batches.flatMap((batch) =>
    (batch.students || []).map(idOf).filter((id: string) => id && id !== studentId)
  );
  const stillActive = await activeStudentIds(otherStudentIds);

  const now = new Date();
  const closed: ClosedGroupSummary[] = [];
  for (const batch of batches) {
    if (!shouldCloseGroup((batch.students || []).map(idOf), studentId, stillActive)) continue;

    batch.isActive = false;
    batch.closedAt = now;
    batch.closedReason = DEACTIVATION_CLOSURE_REASON;
    batch.closedBy = actor?.id && Types.ObjectId.isValid(actor.id) ? new Types.ObjectId(actor.id) : undefined;
    const closedFor = new Set<string>((batch.closedForStudents || []).map(idOf));
    closedFor.add(studentId);
    batch.closedForStudents = Array.from(closedFor).map((id) => new Types.ObjectId(id));
    await batch.save();

    closed.push({ id: idOf(batch._id), name: String(batch.name || "Batch"), coach: idOf(batch.coach) });
    await recordActivity({
      actor: actor?.id,
      targetUser: studentId,
      type: "batch.closed",
      label: `Closed batch ${batch.name} because its last active student was deactivated`,
      entityType: "Batch",
      entityId: idOf(batch._id),
      metadata: { reason: DEACTIVATION_CLOSURE_REASON, student: studentId, coach: idOf(batch.coach) },
    });
  }
  return closed;
}

/** Tell each affected coach which of their groups were closed, and why. */
async function notifyCoaches(groups: ClosedGroupSummary[], kind: "closed" | "reopened", studentName: string) {
  const byCoach = new Map<string, string[]>();
  groups.forEach((group) => {
    if (!group.coach || !Types.ObjectId.isValid(group.coach)) return;
    byCoach.set(group.coach, [...(byCoach.get(group.coach) || []), group.name]);
  });
  if (!byCoach.size) return;

  await Notification.insertMany(
    Array.from(byCoach.entries()).map(([coach, names]) => ({
      user: coach,
      type: kind === "closed" ? "batch_closed" : "batch_reopened",
      title: kind === "closed" ? "A batch of yours was closed" : "A batch of yours was reopened",
      message:
        kind === "closed"
          ? `${names.join(", ")} ${names.length === 1 ? "has" : "have"} been closed because ${studentName} was deactivated. Closed batches stay visible under Closed Batches.`
          : `${names.join(", ")} ${names.length === 1 ? "is" : "are"} running again because ${studentName} was reactivated.`,
      metadata: { groups: names, reason: DEACTIVATION_CLOSURE_REASON, href: "/classrooms/closed" },
    })),
    { ordered: false }
  ).catch(() => undefined);
}

/**
 * Everything that has to happen when a student account is switched off. Safe to
 * run more than once - a classroom or batch already closed is skipped, and an
 * invoice already voided no longer matches the voidable statuses.
 */
export async function applyStudentDeactivation(studentId: string, actor?: DeactivationActor): Promise<DeactivationSummary | null> {
  if (!Types.ObjectId.isValid(studentId)) return null;
  const student: any = await User.findById(studentId).select("name username role").lean();
  if (!student || student.role !== "student") return null;
  const studentName = String(student.name || student.username || "the student");

  const from = dayStart();
  const invoicesVoided = await voidUpcomingInvoices(studentId, from, actor);
  const classroomsClosed = await closeEmptyClassrooms(studentId, actor);
  const batchesClosed = await closeEmptyBatches(studentId, actor);
  await notifyCoaches([...classroomsClosed, ...batchesClosed], "closed", studentName);

  if (invoicesVoided || classroomsClosed.length || batchesClosed.length) {
    await recordActivity({
      actor: actor?.id,
      targetUser: studentId,
      type: "student.deactivation.applied",
      label: `Closed ${classroomsClosed.length} classroom${classroomsClosed.length === 1 ? "" : "s"} and ${batchesClosed.length} batch${batchesClosed.length === 1 ? "" : "es"} after deactivating ${studentName}`,
      entityType: "User",
      entityId: studentId,
      metadata: {
        invoicesVoided,
        classroomsClosed: classroomsClosed.length,
        batchesClosed: batchesClosed.length,
        coaches: Array.from(new Set([...classroomsClosed, ...batchesClosed].map((group) => group.coach).filter(Boolean))),
      },
    });
  }

  return { student: studentId, studentName, invoicesVoided, classroomsClosed, batchesClosed };
}

/** Undo the closures a deactivation caused, when the account is switched back on. */
export async function applyStudentReactivation(studentId: string, actor?: DeactivationActor): Promise<ReactivationSummary | null> {
  if (!Types.ObjectId.isValid(studentId)) return null;
  const student: any = await User.findById(studentId).select("name username role").lean();
  if (!student || student.role !== "student") return null;
  const studentName = String(student.name || student.username || "the student");
  const sid = new Types.ObjectId(studentId);
  const from = dayStart();

  const invoicesRestored = await restoreVoidedInvoices(studentId, from, actor);

  const classrooms: any[] = await Classroom.find({
    closedReason: DEACTIVATION_CLOSURE_REASON,
    closedForStudents: sid,
    isActive: false,
    isSessionInstance: { $ne: true },
  });
  const classroomsReopened: ClosedGroupSummary[] = [];
  for (const classroom of classrooms) {
    let sessionsRestored = 0;
    (classroom.generatedSessions || []).forEach((session: any) => {
      if (!session?.summary?.closedByStudentDeactivation) return;
      session.status = String(session.summary.previousStatus || "scheduled");
      const { closedByStudentDeactivation, previousStatus, ...rest } = session.summary || {};
      session.summary = rest;
      sessionsRestored += 1;
    });
    classroom.isActive = true;
    classroom.status = String(classroom.previousStatus || "scheduled");
    classroom.closedAt = undefined;
    classroom.closedReason = undefined;
    classroom.closedBy = undefined;
    classroom.closedForStudents = [];
    classroom.previousStatus = undefined;
    await classroom.save();
    await syncClassroomSessionInstances(idOf(classroom._id)).catch(() => undefined);
    classroomsReopened.push({
      id: idOf(classroom._id),
      name: String(classroom.title || "Classroom"),
      coach: idOf(classroom.coach || classroom.instructor),
      sessionsCancelled: sessionsRestored,
    });
  }

  const batches: any[] = await Batch.find({
    closedReason: DEACTIVATION_CLOSURE_REASON,
    closedForStudents: sid,
    isActive: false,
  });
  const batchesReopened: ClosedGroupSummary[] = [];
  for (const batch of batches) {
    batch.isActive = true;
    batch.closedAt = undefined;
    batch.closedReason = undefined;
    batch.closedBy = undefined;
    batch.closedForStudents = [];
    await batch.save();
    batchesReopened.push({ id: idOf(batch._id), name: String(batch.name || "Batch"), coach: idOf(batch.coach) });
  }

  await notifyCoaches([...classroomsReopened, ...batchesReopened], "reopened", studentName);

  if (invoicesRestored || classroomsReopened.length || batchesReopened.length) {
    await recordActivity({
      actor: actor?.id,
      targetUser: studentId,
      type: "student.reactivation.applied",
      label: `Reopened ${classroomsReopened.length} classroom${classroomsReopened.length === 1 ? "" : "s"} and ${batchesReopened.length} batch${batchesReopened.length === 1 ? "" : "es"} after reactivating ${studentName}`,
      entityType: "User",
      entityId: studentId,
      metadata: { invoicesRestored, classroomsReopened: classroomsReopened.length, batchesReopened: batchesReopened.length },
    });
  }

  return { student: studentId, studentName, invoicesRestored, classroomsReopened, batchesReopened };
}

export type DeactivationPreview = {
  student: string;
  studentName: string;
  deactivatedAt: string | null;
  invoices: number;
  classrooms: string[];
  batches: string[];
};

/** What `applyStudentDeactivation` would do for this student, without writing anything. */
export async function previewStudentDeactivation(studentId: string): Promise<DeactivationPreview | null> {
  if (!Types.ObjectId.isValid(studentId)) return null;
  const student: any = await User.findById(studentId).select("name username role deactivatedAt").lean();
  if (!student || student.role !== "student") return null;
  const sid = new Types.ObjectId(studentId);
  const from = dayStart();

  const invoices = await Invoice.countDocuments({
    student: sid,
    status: { $in: VOIDABLE_INVOICE_STATUSES },
    dueDate: { $gte: from },
  });

  const studentBatches: any[] = await Batch.find({ students: sid }).select("_id").lean();
  const classrooms: any[] = await Classroom.find({
    $or: [{ students: sid }, ...(studentBatches.length ? [{ batches: { $in: studentBatches.map((batch: any) => batch._id) } }] : [])],
    isActive: { $ne: false },
    isSessionInstance: { $ne: true },
  })
    .select("title students batches")
    .lean();
  const batches: any[] = await Batch.find({ students: sid, isActive: { $ne: false } }).select("name students").lean();

  const batchIds = Array.from(new Set(classrooms.flatMap((item: any) => (item.batches || []).map(idOf)).filter(Boolean)));
  const batchRosters: any[] = batchIds.length ? await Batch.find({ _id: { $in: batchIds } }).select("_id students").lean() : [];
  const rosterByBatch = new Map<string, string[]>(batchRosters.map((batch: any) => [idOf(batch._id), (batch.students || []).map(idOf)]));
  const rosterOf = (item: any) =>
    Array.from(
      new Set([...(item.students || []).map(idOf), ...(item.batches || []).flatMap((batch: any) => rosterByBatch.get(idOf(batch)) || [])])
    ).filter(Boolean);

  const stillActive = await activeStudentIds([
    ...classrooms.flatMap((item: any) => rosterOf(item)),
    ...batches.flatMap((batch: any) => (batch.students || []).map(idOf)),
  ].filter((id: string) => id !== studentId));

  return {
    student: studentId,
    studentName: String(student.name || student.username || studentId),
    deactivatedAt: student.deactivatedAt ? new Date(student.deactivatedAt).toISOString() : null,
    invoices,
    classrooms: classrooms.filter((item: any) => shouldCloseGroup(rosterOf(item), studentId, stillActive)).map((item: any) => String(item.title || item._id)),
    batches: batches.filter((batch: any) => shouldCloseGroup((batch.students || []).map(idOf), studentId, stillActive)).map((batch: any) => String(batch.name || batch._id)),
  };
}

export type BackfillResult = {
  apply: boolean;
  studentsScanned: number;
  studentsChanged: number;
  invoicesVoided: number;
  classroomsClosed: number;
  batchesClosed: number;
  students: Array<{ student: string; studentName: string; deactivatedAt: string | null; invoices: number; classrooms: string[]; batches: string[] }>;
};

/**
 * Runs the closure over every student who is already deactivated. Accounts that
 * were switched off before this existed never had their batches closed or their
 * invoices voided; this catches them up. Re-running it is harmless - a group
 * already closed no longer matches, and a voided invoice is no longer voidable.
 */
export async function backfillStudentDeactivations(options: { apply?: boolean; limit?: number; actor?: DeactivationActor } = {}): Promise<BackfillResult> {
  const apply = options.apply === true;
  const query = User.find({ role: "student", isActive: false }).select("name username deactivatedAt").sort({ deactivatedAt: -1 });
  if (options.limit) query.limit(options.limit);
  const students: any[] = await query.lean();

  const result: BackfillResult = {
    apply,
    studentsScanned: students.length,
    studentsChanged: 0,
    invoicesVoided: 0,
    classroomsClosed: 0,
    batchesClosed: 0,
    students: [],
  };

  for (const student of students) {
    const studentId = idOf(student._id);
    const preview = await previewStudentDeactivation(studentId);
    if (!preview) continue;
    if (!preview.invoices && !preview.classrooms.length && !preview.batches.length) continue;

    if (apply) {
      const applied = await applyStudentDeactivation(studentId, options.actor);
      if (!applied) continue;
      result.invoicesVoided += applied.invoicesVoided;
      result.classroomsClosed += applied.classroomsClosed.length;
      result.batchesClosed += applied.batchesClosed.length;
      result.students.push({
        student: studentId,
        studentName: applied.studentName,
        deactivatedAt: preview.deactivatedAt,
        invoices: applied.invoicesVoided,
        classrooms: applied.classroomsClosed.map((group) => group.name),
        batches: applied.batchesClosed.map((group) => group.name),
      });
    } else {
      result.invoicesVoided += preview.invoices;
      result.classroomsClosed += preview.classrooms.length;
      result.batchesClosed += preview.batches.length;
      result.students.push(preview);
    }
    result.studentsChanged += 1;
  }
  return result;
}

export type CoachClosureCount = {
  coach: string;
  closedClassrooms: number;
  closedBatches: number;
  total: number;
  lastClosedAt: string | null;
};

/**
 * How many groups have been closed under each coach. Counted from the records
 * themselves rather than a stored tally, so it cannot drift out of step with a
 * reopen.
 */
export async function closedGroupCountsByCoach(coachIds?: string[]): Promise<Map<string, CoachClosureCount>> {
  const scope = (coachIds || []).filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
  const match: any = { isActive: false, closedReason: DEACTIVATION_CLOSURE_REASON };
  const counts = new Map<string, CoachClosureCount>();

  const read = (rows: any[], key: "closedClassrooms" | "closedBatches") => {
    rows.forEach((row: any) => {
      const coach = idOf(row._id);
      if (!coach) return;
      const current = counts.get(coach) || { coach, closedClassrooms: 0, closedBatches: 0, total: 0, lastClosedAt: null };
      current[key] = Number(row.count || 0);
      current.total = current.closedClassrooms + current.closedBatches;
      const closedAt = row.lastClosedAt ? new Date(row.lastClosedAt).toISOString() : null;
      if (closedAt && (!current.lastClosedAt || closedAt > current.lastClosedAt)) current.lastClosedAt = closedAt;
      counts.set(coach, current);
    });
  };

  const [classroomRows, batchRows] = await Promise.all([
    Classroom.aggregate([
      { $match: { ...match, isSessionInstance: { $ne: true }, ...(scope.length ? { coach: { $in: scope } } : {}) } },
      { $group: { _id: "$coach", count: { $sum: 1 }, lastClosedAt: { $max: "$closedAt" } } },
    ]),
    Batch.aggregate([
      { $match: { ...match, ...(scope.length ? { coach: { $in: scope } } : {}) } },
      { $group: { _id: "$coach", count: { $sum: 1 }, lastClosedAt: { $max: "$closedAt" } } },
    ]),
  ]);
  read(classroomRows, "closedClassrooms");
  read(batchRows, "closedBatches");
  return counts;
}
