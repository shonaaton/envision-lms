import { Types } from "mongoose";

import { recordActivity } from "@/lib/activity";
import { syncClassroomSessionInstances } from "@/lib/classroomSessionInstances";
import { scheduleDatesFrom } from "@/lib/classroomSchedule";
import { Batch } from "@/models/Batch";
import { Classroom } from "@/models/Classroom";
import { Invoice, Notification } from "@/models/Fee";
import { User } from "@/models/User";

/**
 * The two ways a student leaves circulation, and what each does to the groups
 * built around them.
 *
 * A DEACTIVATION is permanent: the batches and classrooms the student was the
 * last attending member of are closed, their remaining classes cancelled, and
 * their upcoming invoices voided.
 *
 * A PAUSE is temporary: the same groups are paused rather than closed. Nothing
 * is cancelled and no invoice is voided - the classes that were waiting are
 * re-dated onto the schedule from the restart day, and the invoices move with
 * the student (handled by `studentPause`, which owns the dates).
 *
 * Rosters are deliberately left untouched in both cases. Membership is history -
 * attendance, homework and reports all read it - so "is this batch still
 * running" is decided by whether any attending student remains, never by
 * deleting the student from it.
 */

export const DEACTIVATION_CLOSURE_REASON = "student_deactivated";
export const CLOSURE_REASONS = [DEACTIVATION_CLOSURE_REASON];

/** Invoices in these states have not been settled, so a deactivation can void them. */
const VOIDABLE_INVOICE_STATUSES = ["draft", "unpaid", "overdue"];

/** Sessions in these states have not happened yet, so closing a classroom cancels them. */
const OPEN_SESSION_STATUSES = ["scheduled", "ongoing", "in_progress"];

export type ClosureActor = {
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

export type GroupClosureSummary = {
  classroomsClosed: ClosedGroupSummary[];
  batchesClosed: ClosedGroupSummary[];
};

export type GroupReopenSummary = {
  classroomsReopened: ClosedGroupSummary[];
  batchesReopened: ClosedGroupSummary[];
};

export type DeactivationSummary = GroupClosureSummary & {
  student: string;
  studentName: string;
  invoicesVoided: number;
};

export type ReactivationSummary = GroupReopenSummary & {
  student: string;
  studentName: string;
  invoicesRestored: number;
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
 * Whether a group closes when this student steps out of it: only if the student
 * was actually in it and nobody active is left behind. Kept pure so the rule can
 * be read and tested on its own - it is the one decision the whole module turns
 * on, for a pause and a deactivation alike.
 */
export function shouldCloseGroup(roster: string[], studentId: string, activeStudentIdSet: Set<string>) {
  const members = roster.filter(Boolean);
  if (!members.includes(studentId)) return false;
  return !members.some((id) => id !== studentId && activeStudentIdSet.has(id));
}

/**
 * Of the given ids, the ones belonging to a student who is actually attending.
 * A paused student counts as away exactly like a deactivated one - they are off
 * every future session roster - so a batch whose only other member is paused is
 * still an empty batch.
 */
async function attendingStudentIds(ids: string[]) {
  const unique = Array.from(new Set(ids.filter((id) => Types.ObjectId.isValid(id))));
  if (!unique.length) return new Set<string>();
  const rows: any[] = await User.find({ _id: { $in: unique }, isActive: { $ne: false }, isPaused: { $ne: true } })
    .select("_id")
    .lean();
  return new Set(rows.map((row) => idOf(row._id)));
}

/** True when the student is back in circulation: account on and not paused. */
async function isAttending(studentId: string) {
  if (!Types.ObjectId.isValid(studentId)) return false;
  return Boolean(await User.exists({ _id: studentId, isActive: { $ne: false }, isPaused: { $ne: true } }));
}

/**
 * Every classroom this student can reach, with the full roster of each. The
 * student reaches a classroom either directly or through a batch attached to it,
 * and the two can disagree when someone joined the batch after the classroom was
 * built, so both routes are followed.
 */
async function classroomsWithRosters(studentId: string, options: { lean?: boolean } = {}) {
  const sid = new Types.ObjectId(studentId);
  const studentBatches: any[] = await Batch.find({ students: sid }).select("_id").lean();
  const filter = {
    $or: [{ students: sid }, ...(studentBatches.length ? [{ batches: { $in: studentBatches.map((batch: any) => batch._id) } }] : [])],
    isActive: { $ne: false },
    isSessionInstance: { $ne: true },
  };
  const classrooms: any[] = options.lean
    ? await Classroom.find(filter).select("title students batches coach instructor isPaused").lean()
    : await Classroom.find(filter);
  if (!classrooms.length) return { classrooms, rosterOf: () => [] as string[] };

  const batchIds = Array.from(new Set(classrooms.flatMap((item: any) => (item.batches || []).map(idOf)).filter(Boolean)));
  const batchRosters: any[] = batchIds.length ? await Batch.find({ _id: { $in: batchIds } }).select("_id students").lean() : [];
  const rosterByBatch = new Map<string, string[]>(
    batchRosters.map((batch: any) => [idOf(batch._id), (batch.students || []).map(idOf)])
  );
  const rosterOf = (item: any) =>
    Array.from(
      new Set([...(item.students || []).map(idOf), ...(item.batches || []).flatMap((batch: any) => rosterByBatch.get(idOf(batch)) || [])])
    ).filter(Boolean);

  return { classrooms, rosterOf };
}

/**
 * Close every classroom the student was the last attending member of. A classroom
 * that still has another attending student keeps running - only the empty ones
 * are switched off, and their remaining classes are cancelled with them.
 */
async function closeEmptyClassrooms(studentId: string, actor?: ClosureActor) {
  const { classrooms, rosterOf } = await classroomsWithRosters(studentId);
  if (!classrooms.length) return [] as ClosedGroupSummary[];

  const stillAttending = await attendingStudentIds(
    classrooms.flatMap((classroom: any) => rosterOf(classroom).filter((id: string) => id !== studentId))
  );

  const now = new Date();
  const closed: ClosedGroupSummary[] = [];
  for (const classroom of classrooms) {
    // A classroom the student never belonged to is left alone even if one of its
    // batches matched - only groups this student was part of can close for them.
    if (!shouldCloseGroup(rosterOf(classroom), studentId, stillAttending)) continue;

    let sessionsCancelled = 0;
    (classroom.generatedSessions || []).forEach((session: any) => {
      const scheduledFor = session?.scheduledFor ? new Date(session.scheduledFor) : null;
      const status = String(session?.status || "scheduled").toLowerCase();
      if (!scheduledFor || session?.actualEndedAt || !OPEN_SESSION_STATUSES.includes(status)) return;
      if (scheduledFor.getTime() < now.getTime()) return;
      session.status = "cancelled";
      session.summary = { ...(session.summary || {}), closedByStudentAbsence: true, previousStatus: status };
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
      label: `Closed ${classroom.title} because its last attending student was deactivated`,
      entityType: "Classroom",
      entityId: idOf(classroom._id),
      metadata: { reason: DEACTIVATION_CLOSURE_REASON, student: studentId, sessionsCancelled, coach: idOf(classroom.coach || classroom.instructor) },
    });
  }
  return closed;
}

/** Close every batch the student was the last attending member of. */
async function closeEmptyBatches(studentId: string, actor?: ClosureActor) {
  const batches: any[] = await Batch.find({ students: new Types.ObjectId(studentId), isActive: { $ne: false } });
  if (!batches.length) return [] as ClosedGroupSummary[];

  const stillAttending = await attendingStudentIds(
    batches.flatMap((batch) => (batch.students || []).map(idOf).filter((id: string) => id && id !== studentId))
  );

  const now = new Date();
  const closed: ClosedGroupSummary[] = [];
  for (const batch of batches) {
    if (!shouldCloseGroup((batch.students || []).map(idOf), studentId, stillAttending)) continue;

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
      label: `Closed batch ${batch.name} because its last attending student was deactivated`,
      entityType: "Batch",
      entityId: idOf(batch._id),
      metadata: { reason: DEACTIVATION_CLOSURE_REASON, student: studentId, coach: idOf(batch.coach) },
    });
  }
  return closed;
}

type CoachNotice = "closed" | "reopened" | "paused" | "resumed";

const COACH_NOTICE_COPY: Record<CoachNotice, { type: string; title: string; body: (names: string, plural: boolean, student: string) => string; href?: string }> = {
  closed: {
    type: "batch_closed",
    title: "A batch of yours was closed",
    href: "/classrooms/closed",
    body: (names, plural, student) =>
      `${names} ${plural ? "have" : "has"} been closed because ${student} was deactivated. Closed batches stay visible under Closed Batches.`,
  },
  reopened: {
    type: "batch_reopened",
    title: "A batch of yours was reopened",
    body: (names, plural, student) => `${names} ${plural ? "are" : "is"} running again because ${student} is back.`,
  },
  paused: {
    type: "batch_paused",
    title: "A batch of yours is paused",
    body: (names, plural, student) =>
      `${names} ${plural ? "are" : "is"} paused while ${student} is away. Nothing is cancelled - the remaining classes are rescheduled from the restart date.`,
  },
  resumed: {
    type: "batch_resumed",
    title: "A paused batch of yours has restarted",
    body: (names, plural, student) =>
      `${names} ${plural ? "are" : "is"} running again now that ${student} is back. The remaining classes have been rescheduled from the restart date.`,
  },
};

/** Tell each affected coach which of their groups changed state, and why. */
async function notifyCoaches(groups: ClosedGroupSummary[], notice: CoachNotice, studentName: string) {
  const byCoach = new Map<string, string[]>();
  groups.forEach((group) => {
    if (!group.coach || !Types.ObjectId.isValid(group.coach)) return;
    byCoach.set(group.coach, [...(byCoach.get(group.coach) || []), group.name]);
  });
  if (!byCoach.size) return;

  const copy = COACH_NOTICE_COPY[notice];
  await Notification.insertMany(
    Array.from(byCoach.entries()).map(([coach, names]) => ({
      user: coach,
      type: copy.type,
      title: copy.title,
      message: copy.body(names.join(", "), names.length !== 1, studentName),
      metadata: { groups: names, notice, ...(copy.href ? { href: copy.href } : {}) },
    })),
    { ordered: false }
  ).catch(() => undefined);
}

/**
 * Close the batches and classrooms this student was the last attending member of.
 * Safe to run more than once - a group already closed no longer matches.
 */
export async function closeEmptyGroupsForStudent(studentId: string, actor?: ClosureActor): Promise<GroupClosureSummary> {
  if (!Types.ObjectId.isValid(studentId)) return { classroomsClosed: [], batchesClosed: [] };
  const student: any = await User.findById(studentId).select("name username role").lean();
  if (!student || student.role !== "student") return { classroomsClosed: [], batchesClosed: [] };

  const classroomsClosed = await closeEmptyClassrooms(studentId, actor);
  const batchesClosed = await closeEmptyBatches(studentId, actor);
  await notifyCoaches([...classroomsClosed, ...batchesClosed], "closed", String(student.name || student.username || "the student"));
  return { classroomsClosed, batchesClosed };
}

/**
 * Reopen the groups that were closed for this student, whichever route closed
 * them. Nothing happens unless the student is genuinely back - account on and
 * not paused - and a group is only reopened if it now has someone attending, so
 * a student who resumes into a different batch does not drag the old one open.
 */
export async function reopenGroupsClosedForStudent(studentId: string, actor?: ClosureActor): Promise<GroupReopenSummary> {
  const empty: GroupReopenSummary = { classroomsReopened: [], batchesReopened: [] };
  if (!Types.ObjectId.isValid(studentId)) return empty;
  if (!(await isAttending(studentId))) return empty;
  const student: any = await User.findById(studentId).select("name username role").lean();
  if (!student || student.role !== "student") return empty;
  const sid = new Types.ObjectId(studentId);

  const closedFilter = { closedForStudents: sid, isActive: false, closedReason: { $in: CLOSURE_REASONS } };

  const classrooms: any[] = await Classroom.find({ ...closedFilter, isSessionInstance: { $ne: true } });
  const batchIds = Array.from(new Set(classrooms.flatMap((item: any) => (item.batches || []).map(idOf)).filter(Boolean)));
  const batchRosters: any[] = batchIds.length ? await Batch.find({ _id: { $in: batchIds } }).select("_id students").lean() : [];
  const rosterByBatch = new Map<string, string[]>(batchRosters.map((batch: any) => [idOf(batch._id), (batch.students || []).map(idOf)]));
  const rosterOf = (item: any) =>
    Array.from(
      new Set([...(item.students || []).map(idOf), ...(item.batches || []).flatMap((batch: any) => rosterByBatch.get(idOf(batch)) || [])])
    ).filter(Boolean);

  const batches: any[] = await Batch.find(closedFilter);
  const attending = await attendingStudentIds([
    ...classrooms.flatMap((item: any) => rosterOf(item)),
    ...batches.flatMap((batch: any) => (batch.students || []).map(idOf)),
  ]);

  const now = new Date();
  const classroomsReopened: ClosedGroupSummary[] = [];
  for (const classroom of classrooms) {
    if (!rosterOf(classroom).some((id: string) => attending.has(id))) continue;
    let sessionsRestored = 0;
    (classroom.generatedSessions || []).forEach((session: any) => {
      if (!session?.summary?.closedByStudentAbsence) return;
      const scheduledFor = session?.scheduledFor ? new Date(session.scheduledFor) : null;
      // A class that fell inside the absence was never taught, so it stays
      // cancelled - only the ones still ahead are put back on the calendar.
      if (scheduledFor && scheduledFor.getTime() >= now.getTime()) {
        session.status = String(session.summary.previousStatus || "scheduled");
        sessionsRestored += 1;
      }
      const { closedByStudentAbsence, previousStatus, ...rest } = session.summary || {};
      session.summary = rest;
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

  const batchesReopened: ClosedGroupSummary[] = [];
  for (const batch of batches) {
    if (!(batch.students || []).map(idOf).some((id: string) => attending.has(id))) continue;
    batch.isActive = true;
    batch.closedAt = undefined;
    batch.closedReason = undefined;
    batch.closedBy = undefined;
    batch.closedForStudents = [];
    await batch.save();
    batchesReopened.push({ id: idOf(batch._id), name: String(batch.name || "Batch"), coach: idOf(batch.coach) });
  }

  await notifyCoaches([...classroomsReopened, ...batchesReopened], "reopened", String(student.name || student.username || "the student"));
  return { classroomsReopened, batchesReopened };
}

export type PausedGroupSummary = {
  id: string;
  name: string;
  coach: string;
  sessionsAffected?: number;
};

export type GroupPauseSummary = {
  classroomsPaused: PausedGroupSummary[];
  batchesPaused: PausedGroupSummary[];
};

export type GroupResumeSummary = {
  classroomsResumed: PausedGroupSummary[];
  batchesResumed: PausedGroupSummary[];
};

/**
 * Pause the batches and classrooms this student was the last attending member
 * of. Nothing is cancelled and no roster is touched - the group simply drops off
 * the coach's board until the student comes back, and `resumeGroupsForStudent`
 * puts its remaining classes back on the calendar from the restart day.
 */
export async function pauseEmptyGroupsForStudent(
  studentId: string,
  options: { pausedFrom?: Date | null; pausedUntil?: Date | null; actor?: ClosureActor } = {}
): Promise<GroupPauseSummary> {
  const empty: GroupPauseSummary = { classroomsPaused: [], batchesPaused: [] };
  if (!Types.ObjectId.isValid(studentId)) return empty;
  const student: any = await User.findById(studentId).select("name username role").lean();
  if (!student || student.role !== "student") return empty;

  const now = new Date();
  const pausedFrom = options.pausedFrom ? new Date(options.pausedFrom) : dayStart();
  const pausedUntil = options.pausedUntil ? new Date(options.pausedUntil) : undefined;

  const stamp = (doc: any) => {
    doc.isPaused = true;
    doc.pausedAt = now;
    doc.pausedFrom = pausedFrom;
    doc.pausedUntil = pausedUntil;
    const pausedFor = new Set<string>((doc.pausedForStudents || []).map(idOf));
    pausedFor.add(studentId);
    doc.pausedForStudents = Array.from(pausedFor).map((id) => new Types.ObjectId(id));
  };

  const { classrooms, rosterOf } = await classroomsWithRosters(studentId);
  const stillAttending = await attendingStudentIds(
    classrooms.flatMap((classroom: any) => rosterOf(classroom).filter((id: string) => id !== studentId))
  );

  const classroomsPaused: PausedGroupSummary[] = [];
  for (const classroom of classrooms) {
    if (classroom.isPaused === true) continue;
    if (!shouldCloseGroup(rosterOf(classroom), studentId, stillAttending)) continue;
    const waiting = (classroom.generatedSessions || []).filter(
      (session: any) => session?.scheduledFor && new Date(session.scheduledFor).getTime() >= pausedFrom.getTime() && !session?.actualEndedAt
    ).length;
    stamp(classroom);
    await classroom.save();
    await syncClassroomSessionInstances(idOf(classroom._id)).catch(() => undefined);
    classroomsPaused.push({
      id: idOf(classroom._id),
      name: String(classroom.title || "Classroom"),
      coach: idOf(classroom.coach || classroom.instructor),
      sessionsAffected: waiting,
    });
    await recordActivity({
      actor: options.actor?.id,
      targetUser: studentId,
      type: "classroom.paused",
      label: `Paused ${classroom.title} while its last attending student is away`,
      entityType: "Classroom",
      entityId: idOf(classroom._id),
      metadata: { student: studentId, pausedFrom, pausedUntil, sessionsWaiting: waiting, coach: idOf(classroom.coach || classroom.instructor) },
    });
  }

  const batches: any[] = await Batch.find({ students: new Types.ObjectId(studentId), isActive: { $ne: false }, isPaused: { $ne: true } });
  const batchAttending = await attendingStudentIds(
    batches.flatMap((batch) => (batch.students || []).map(idOf).filter((id: string) => id && id !== studentId))
  );
  const batchesPaused: PausedGroupSummary[] = [];
  for (const batch of batches) {
    if (!shouldCloseGroup((batch.students || []).map(idOf), studentId, batchAttending)) continue;
    stamp(batch);
    await batch.save();
    batchesPaused.push({ id: idOf(batch._id), name: String(batch.name || "Batch"), coach: idOf(batch.coach) });
    await recordActivity({
      actor: options.actor?.id,
      targetUser: studentId,
      type: "batch.paused",
      label: `Paused batch ${batch.name} while its last attending student is away`,
      entityType: "Batch",
      entityId: idOf(batch._id),
      metadata: { student: studentId, pausedFrom, pausedUntil, coach: idOf(batch.coach) },
    });
  }

  await notifyCoaches([...classroomsPaused, ...batchesPaused], "paused", String(student.name || student.username || "the student"));
  return { classroomsPaused, batchesPaused };
}

/**
 * Restart the groups paused for this student and put their waiting classes back
 * on the calendar from `restartDate`, following the classroom's own weekly
 * schedule. The classes are re-dated rather than dropped, so the student keeps
 * every class they were owed and the series simply ends later.
 */
export async function resumeGroupsForStudent(
  studentId: string,
  options: { restartDate: Date; reschedule?: boolean; actor?: ClosureActor }
): Promise<GroupResumeSummary> {
  const empty: GroupResumeSummary = { classroomsResumed: [], batchesResumed: [] };
  if (!Types.ObjectId.isValid(studentId)) return empty;
  if (!(await isAttending(studentId))) return empty;
  const student: any = await User.findById(studentId).select("name username role").lean();
  if (!student || student.role !== "student") return empty;
  const sid = new Types.ObjectId(studentId);
  const restartDate = new Date(options.restartDate);

  const classrooms: any[] = await Classroom.find({ pausedForStudents: sid, isPaused: true, isSessionInstance: { $ne: true } });
  const classroomsResumed: PausedGroupSummary[] = [];
  for (const classroom of classrooms) {
    const pausedFrom = classroom.pausedFrom ? new Date(classroom.pausedFrom) : restartDate;
    // Everything from the pause onwards that was never taught is still owed.
    const waiting = (classroom.generatedSessions || [])
      .filter((session: any) => {
        if (!session?.scheduledFor || session?.actualEndedAt) return false;
        if (String(session.status || "").toLowerCase() === "completed") return false;
        return new Date(session.scheduledFor).getTime() >= pausedFrom.getTime();
      })
      .sort((a: any, b: any) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());

    // Cancelling a pause asks for the world as it was, so nothing is re-dated -
    // only a real restart moves the waiting classes onto new days.
    const reschedule = options.reschedule !== false;
    const slots = reschedule
      ? scheduleDatesFrom((classroom.daysOfWeek || []) as any, restartDate, waiting.length, Number(classroom.durationMinutes || 60))
      : [];
    // A single class - or a series with no weekly pattern - has no slots to land
    // on, so it just moves forward by however long the student was away.
    const shiftMs = reschedule ? Math.max(0, restartDate.getTime() - pausedFrom.getTime()) : 0;

    // The pause took the student off these session rosters; the restart puts
    // them back, including on classrooms that hang off no batch and so are
    // missed by the batch-scoped roster restore in `studentPause`.
    const onClassroomRoster = (classroom.students || []).map(idOf).includes(studentId);

    waiting.forEach((session: any, index: number) => {
      const target = slots[index];
      if (target && !session.originalDate) session.originalDate = new Date(session.scheduledFor);
      if (target) {
        session.scheduledFor = target.scheduledFor;
        session.startTime = target.startTime;
        session.durationMinutes = target.durationMinutes;
      } else if (shiftMs > 0) {
        session.scheduledFor = new Date(new Date(session.scheduledFor).getTime() + shiftMs);
      }
      if (onClassroomRoster) {
        const roster = (session.students || []).map(idOf);
        if (!roster.includes(studentId)) session.students = [...roster, new Types.ObjectId(studentId)];
      }
      session.status = "scheduled";
    });

    const lastDate = waiting.length ? new Date(waiting[waiting.length - 1].scheduledFor) : null;
    if (lastDate && classroom.endDate && lastDate.getTime() > new Date(classroom.endDate).getTime()) {
      classroom.endDate = lastDate;
    }
    classroom.isPaused = false;
    classroom.pausedAt = undefined;
    classroom.pausedFrom = undefined;
    classroom.pausedUntil = undefined;
    classroom.pausedForStudents = [];
    await classroom.save();
    await syncClassroomSessionInstances(idOf(classroom._id)).catch(() => undefined);

    classroomsResumed.push({
      id: idOf(classroom._id),
      name: String(classroom.title || "Classroom"),
      coach: idOf(classroom.coach || classroom.instructor),
      sessionsAffected: reschedule ? waiting.length : 0,
    });
    await recordActivity({
      actor: options.actor?.id,
      targetUser: studentId,
      type: "classroom.resumed",
      label: reschedule
        ? `Restarted ${classroom.title} and rescheduled ${waiting.length} class${waiting.length === 1 ? "" : "es"} from ${restartDate.toLocaleDateString("en-IN")}`
        : `Restarted ${classroom.title} on its original dates`,
      entityType: "Classroom",
      entityId: idOf(classroom._id),
      metadata: { student: studentId, restartDate, sessionsRescheduled: reschedule ? waiting.length : 0, coach: idOf(classroom.coach || classroom.instructor) },
    });
  }

  const batches: any[] = await Batch.find({ pausedForStudents: sid, isPaused: true });
  const batchesResumed: PausedGroupSummary[] = [];
  for (const batch of batches) {
    batch.isPaused = false;
    batch.pausedAt = undefined;
    batch.pausedFrom = undefined;
    batch.pausedUntil = undefined;
    batch.pausedForStudents = [];
    await batch.save();
    batchesResumed.push({ id: idOf(batch._id), name: String(batch.name || "Batch"), coach: idOf(batch.coach) });
    await recordActivity({
      actor: options.actor?.id,
      targetUser: studentId,
      type: "batch.resumed",
      label: `Restarted batch ${batch.name} from ${restartDate.toLocaleDateString("en-IN")}`,
      entityType: "Batch",
      entityId: idOf(batch._id),
      metadata: { student: studentId, restartDate, coach: idOf(batch.coach) },
    });
  }

  await notifyCoaches([...classroomsResumed, ...batchesResumed], "resumed", String(student.name || student.username || "the student"));
  return { classroomsResumed, batchesResumed };
}

/**
 * Void every unsettled invoice dated on or after the deactivation. Dues that
 * were already outstanding before it are left alone - the academy is still owed
 * those, and wiping them would quietly erase real receivables.
 */
async function voidUpcomingInvoices(studentId: string, fromDate: Date, actor?: ClosureActor) {
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
async function restoreVoidedInvoices(studentId: string, fromDate: Date, actor?: ClosureActor) {
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
 * Everything that has to happen when a student account is switched off: the
 * invoices ahead of them are voided, and the groups they were the last attending
 * member of are closed.
 */
export async function applyStudentDeactivation(studentId: string, actor?: ClosureActor): Promise<DeactivationSummary | null> {
  if (!Types.ObjectId.isValid(studentId)) return null;
  const student: any = await User.findById(studentId).select("name username role").lean();
  if (!student || student.role !== "student") return null;
  const studentName = String(student.name || student.username || "the student");

  const invoicesVoided = await voidUpcomingInvoices(studentId, dayStart(), actor);
  const { classroomsClosed, batchesClosed } = await closeEmptyGroupsForStudent(studentId, actor);

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
export async function applyStudentReactivation(studentId: string, actor?: ClosureActor): Promise<ReactivationSummary | null> {
  if (!Types.ObjectId.isValid(studentId)) return null;
  const student: any = await User.findById(studentId).select("name username role").lean();
  if (!student || student.role !== "student") return null;
  const studentName = String(student.name || student.username || "the student");

  const invoicesRestored = await restoreVoidedInvoices(studentId, dayStart(), actor);
  const { classroomsReopened, batchesReopened } = await reopenGroupsClosedForStudent(studentId, actor);

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

export type ClosurePreview = {
  student: string;
  studentName: string;
  state: "deactivated" | "paused";
  awaySince: string | null;
  invoices: number;
  classrooms: string[];
  batches: string[];
};

/**
 * What the lifecycle change would do for one student, without writing anything.
 * A deactivated student is measured against closure, a paused one against the
 * pause - the group test is the same either way.
 */
export async function previewGroupLifecycle(studentId: string): Promise<ClosurePreview | null> {
  if (!Types.ObjectId.isValid(studentId)) return null;
  const student: any = await User.findById(studentId).select("name username role isActive isPaused deactivatedAt pausedUntil").lean();
  if (!student || student.role !== "student") return null;
  const sid = new Types.ObjectId(studentId);
  // A deactivated account is the stronger of the two states, so it wins when a
  // student happens to be both.
  const state: "deactivated" | "paused" = student.isActive === false ? "deactivated" : "paused";

  // Only a deactivation voids invoices. A pause moves its invoices instead, and
  // `studentPause` owns those dates.
  const invoices =
    state === "deactivated"
      ? await Invoice.countDocuments({ student: sid, status: { $in: VOIDABLE_INVOICE_STATUSES }, dueDate: { $gte: dayStart() } })
      : 0;

  const { classrooms: allClassrooms, rosterOf } = await classroomsWithRosters(studentId, { lean: true });
  // A pause skips what is already paused; a deactivation closes it either way.
  const classrooms = state === "paused" ? allClassrooms.filter((item: any) => item.isPaused !== true) : allClassrooms;
  const batches: any[] = await Batch.find({
    students: sid,
    isActive: { $ne: false },
    ...(state === "paused" ? { isPaused: { $ne: true } } : {}),
  })
    .select("name students")
    .lean();
  const stillAttending = await attendingStudentIds(
    [...classrooms.flatMap((item: any) => rosterOf(item)), ...batches.flatMap((batch: any) => (batch.students || []).map(idOf))].filter(
      (id: string) => id !== studentId
    )
  );

  return {
    student: studentId,
    studentName: String(student.name || student.username || studentId),
    state,
    awaySince: student.deactivatedAt ? new Date(student.deactivatedAt).toISOString() : null,
    invoices,
    classrooms: classrooms
      .filter((item: any) => shouldCloseGroup(rosterOf(item), studentId, stillAttending))
      .map((item: any) => String(item.title || item._id)),
    batches: batches
      .filter((batch: any) => shouldCloseGroup((batch.students || []).map(idOf), studentId, stillAttending))
      .map((batch: any) => String(batch.name || batch._id)),
  };
}

export type BackfillResult = {
  apply: boolean;
  studentsScanned: number;
  studentsChanged: number;
  invoicesVoided: number;
  classroomsClosed: number;
  batchesClosed: number;
  classroomsPaused: number;
  batchesPaused: number;
  students: ClosurePreview[];
};

/**
 * Catches up every student who is already out of circulation. Accounts switched
 * off before this existed never had their batches closed, and students paused
 * before it never had theirs paused; this brings both up to date. Re-running is
 * harmless: a group already closed or paused no longer matches, and a voided
 * invoice is no longer voidable.
 */
export async function backfillGroupLifecycle(
  options: { apply?: boolean; limit?: number; actor?: ClosureActor } = {}
): Promise<BackfillResult> {
  const apply = options.apply === true;
  const query = User.find({ role: "student", $or: [{ isActive: false }, { isPaused: true }] })
    .select("name username isActive isPaused deactivatedAt pausedUntil")
    .sort({ deactivatedAt: -1 });
  if (options.limit) query.limit(options.limit);
  const students: any[] = await query.lean();

  const result: BackfillResult = {
    apply,
    studentsScanned: students.length,
    studentsChanged: 0,
    invoicesVoided: 0,
    classroomsClosed: 0,
    batchesClosed: 0,
    classroomsPaused: 0,
    batchesPaused: 0,
    students: [],
  };

  for (const student of students) {
    const studentId = idOf(student._id);
    const preview = await previewGroupLifecycle(studentId);
    if (!preview) continue;
    if (!preview.invoices && !preview.classrooms.length && !preview.batches.length) continue;

    if (!apply) {
      result.invoicesVoided += preview.invoices;
      if (preview.state === "deactivated") {
        result.classroomsClosed += preview.classrooms.length;
        result.batchesClosed += preview.batches.length;
      } else {
        result.classroomsPaused += preview.classrooms.length;
        result.batchesPaused += preview.batches.length;
      }
      result.students.push(preview);
      result.studentsChanged += 1;
      continue;
    }

    if (preview.state === "deactivated") {
      const applied = await applyStudentDeactivation(studentId, options.actor);
      if (!applied) continue;
      result.invoicesVoided += applied.invoicesVoided;
      result.classroomsClosed += applied.classroomsClosed.length;
      result.batchesClosed += applied.batchesClosed.length;
      result.students.push({
        ...preview,
        invoices: applied.invoicesVoided,
        classrooms: applied.classroomsClosed.map((group) => group.name),
        batches: applied.batchesClosed.map((group) => group.name),
      });
    } else {
      const applied = await pauseEmptyGroupsForStudent(studentId, { pausedUntil: student.pausedUntil, actor: options.actor });
      result.classroomsPaused += applied.classroomsPaused.length;
      result.batchesPaused += applied.batchesPaused.length;
      result.students.push({
        ...preview,
        invoices: 0,
        classrooms: applied.classroomsPaused.map((group) => group.name),
        batches: applied.batchesPaused.map((group) => group.name),
      });
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
 * How many groups have been closed under each coach, by either route. Counted
 * from the records themselves rather than a stored tally, so it cannot drift out
 * of step with a reopen.
 */
export async function closedGroupCountsByCoach(coachIds?: string[]): Promise<Map<string, CoachClosureCount>> {
  const scope = (coachIds || []).filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
  const match: any = { isActive: false, closedReason: { $in: CLOSURE_REASONS } };
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
