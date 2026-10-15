import "server-only";

import { dbConnect } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { academyDateKey, academyDateTime, academyDayBounds } from "@/lib/academyTime";
import { syncClassroomSessionInstances } from "@/lib/classroomSessionInstances";
import { recalculateFutureSessionTopics } from "@/lib/classroomLifecycle";
import { syncLeaveCoverageForClassroom } from "@/lib/leave/leaveService";
import { syncPausedStudentRosters } from "@/lib/studentPause";
import { isMovableUpcomingSession } from "@/lib/seriesTimingChange";
import {
  holidayRangeError,
  holidayRangeLabel,
  planHolidayRestore,
  planHolidayShift,
  rangesOverlap,
  type HolidayRange,
  type HolidayShiftPlan,
} from "@/lib/holidays/holidayPlan";
import { AcademyHoliday } from "@/models/AcademyHoliday";
import { Classroom } from "@/models/Classroom";
import "@/models/Batch";
import "@/models/User";

export class HolidayError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export type HolidayInput = { startKey: string; endKey: string; reason: string; message: string };

export const MAX_MESSAGE_LENGTH = 2000;
/** Longer than this and WhatsApp gets a shortened copy (a template parameter caps at 300). */
export const WHATSAPP_MESSAGE_LIMIT = 300;

function parseInput(raw: any): HolidayInput {
  const input = {
    startKey: String(raw?.startKey || "").trim(),
    endKey: String(raw?.endKey || raw?.startKey || "").trim(),
    reason: String(raw?.reason || "").trim(),
    message: String(raw?.message || "").trim(),
  };
  const rangeError = holidayRangeError(input, academyDateKey(new Date()));
  if (rangeError) throw new HolidayError(rangeError);
  if (!input.reason) throw new HolidayError("Give a reason for the holiday.");
  if (input.reason.length > 120) throw new HolidayError("Keep the reason under 120 characters.");
  if (!input.message) throw new HolidayError("Write the announcement message.");
  if (input.message.length > MAX_MESSAGE_LENGTH) throw new HolidayError(`Keep the message under ${MAX_MESSAGE_LENGTH} characters.`);
  return input;
}

async function activeClosures(excludeId?: string): Promise<HolidayRange[]> {
  const rows: any[] = await AcademyHoliday.find({ status: "active", ...(excludeId ? { _id: { $ne: excludeId } } : {}) })
    .select("startKey endKey")
    .lean();
  return rows.map((row) => ({ startKey: row.startKey, endKey: row.endKey }));
}

function classroomLabel(classroom: any) {
  const batchNames = (classroom.batches || []).map((batch: any) => batch?.name).filter(Boolean);
  return {
    classroomId: String(classroom._id),
    title: String(classroom.title || "Classroom"),
    batch: batchNames.join(", "),
    coach: String(classroom.coach?.name || ""),
  };
}

type SkippedClass = ReturnType<typeof classroomLabel> & { kind: "paused" | "single" | "demo" | "no_slot"; detail: string; when?: Date };

/**
 * Every classroom with a class on the holiday, split into the series the
 * holiday will move and the classes a person has to look at.
 */
async function scanClassrooms(range: HolidayRange, now: Date) {
  const from = academyDateTime(range.startKey, "00:00");
  const to = academyDayBounds(range.endKey).end;
  const classrooms: any[] = await Classroom.find({
    isSessionInstance: { $ne: true },
    isActive: { $ne: false },
    status: { $nin: ["completed", "cancelled"] },
    generatedSessions: { $elemMatch: { scheduledFor: { $gte: from, $lte: to } } },
  })
    .populate("batches", "name")
    .populate("coach", "name");

  const otherClosures = await activeClosures();
  const series: Array<{ classroom: any; plan: HolidayShiftPlan }> = [];
  const skipped: SkippedClass[] = [];

  for (const classroom of classrooms) {
    const inRange = (classroom.generatedSessions || []).filter((session: any) => {
      const at = new Date(session.scheduledFor).getTime();
      return at >= from.getTime() && at <= to.getTime() && isMovableUpcomingSession(session, now);
    });
    if (!inRange.length) continue;
    const label = classroomLabel(classroom);

    if (classroom.classroomType !== "series") {
      const kind = classroom.classroomType === "demo" ? "demo" : "single";
      inRange.forEach((session: any) => skipped.push({
        ...label,
        kind,
        when: session.scheduledFor,
        detail: kind === "demo" ? "Demo class - reschedule it with the family." : "One-off class - reschedule or cancel it by hand.",
      }));
      continue;
    }
    if (classroom.isPaused) {
      skipped.push({ ...label, kind: "paused", detail: `${inRange.length} class${inRange.length === 1 ? "" : "es"} on hold - re-dated when the classroom resumes.` });
      continue;
    }

    const plan = planHolidayShift({
      sessions: classroom.generatedSessions || [],
      daysOfWeek: classroom.daysOfWeek || [],
      holiday: range,
      otherClosures: otherClosures.filter((closure) => !rangesOverlap(closure, range)),
      now,
      fallbackStartTime: classroom.startTime,
      fallbackDurationMinutes: classroom.durationMinutes,
    });
    if (plan.error) {
      skipped.push({ ...label, kind: "no_slot", detail: plan.error });
      continue;
    }
    if (plan.moves.length) series.push({ classroom, plan });
  }

  return { series, skipped };
}

function summarize(series: Array<{ classroom: any; plan: HolidayShiftPlan }>, skipped: SkippedClass[]) {
  return {
    classrooms: series.length,
    classesOnHoliday: series.reduce((sum, item) => sum + item.plan.inHoliday, 0),
    classesMoved: series.reduce((sum, item) => sum + item.plan.moves.length, 0),
    classesAdded: series.reduce((sum, item) => sum + item.plan.appended, 0),
    details: series.map(({ classroom, plan }) => ({
      ...classroomLabel(classroom),
      inHoliday: plan.inHoliday,
      newEndDate: plan.newEndDate,
      moves: plan.moves.map((move) => ({
        sessionId: move.sessionId,
        topicName: String(move.session.topicName || ""),
        from: move.from.scheduledFor,
        to: move.to.scheduledFor,
      })),
    })),
    skipped,
  };
}

export async function previewHoliday(raw: unknown) {
  await dbConnect();
  const input = parseInput(raw);
  await assertNoOverlap(input);
  const { series, skipped } = await scanClassrooms(input, new Date());
  return summarize(series, skipped);
}

async function assertNoOverlap(range: HolidayRange, excludeId?: string) {
  const clash = (await activeClosures(excludeId)).find((closure) => rangesOverlap(closure, range));
  if (clash) throw new HolidayError(`This overlaps the holiday already set for ${holidayRangeLabel(clash)}. Cancel that one first or pick other dates.`, 409);
}

/**
 * Declare the holiday: move every series' classes off the closed days, record
 * each move so it can be undone, and queue the announcement. The plan is always
 * recomputed here - a preview is only ever a preview.
 */
export async function declareHoliday(raw: unknown, actorId: string) {
  await dbConnect();
  const input = parseInput(raw);
  await assertNoOverlap(input);
  const now = new Date();
  const { series, skipped } = await scanClassrooms(input, now);
  const summary = summarize(series, skipped);

  // Saved before any class moves, so a second admin pressing the button at the
  // same moment hits the overlap check rather than moving everything twice.
  const holiday: any = await AcademyHoliday.create({
    ...input,
    createdBy: actorId,
    skipped,
    announcement: { status: "pending" },
  });

  const touched: string[] = [];
  for (const { classroom, plan } of series) {
    try {
      const records = plan.moves.map((move) => {
        const session = move.session;
        const record = {
          classroom: classroom._id,
          sessionId: move.sessionId,
          topicName: String(session.topicName || ""),
          fromScheduledFor: move.from.scheduledFor,
          fromStartTime: move.from.startTime,
          fromDurationMinutes: move.from.durationMinutes,
          fromSubstituteCoach: session.substituteCoach || undefined,
          hadOriginalDate: Boolean(session.originalDate),
          toScheduledFor: move.to.scheduledFor,
          toStartTime: move.to.startTime,
          toDurationMinutes: move.to.durationMinutes,
        };
        if (!session.originalDate) session.originalDate = session.scheduledFor;
        session.scheduledFor = move.to.scheduledFor;
        session.startTime = move.to.startTime;
        session.durationMinutes = move.to.durationMinutes;
        session.status = "scheduled";
        session.coachAttendanceStatus = "pending";
        session.notes = [session.notes, `Academy holiday: ${input.reason}`].filter(Boolean).join("\n");
        // Reminders were claimed for the old time; the new one needs its own.
        session.notifiedKinds = [];
        // A substitute was booked for a day, not for a topic. The leave sync
        // re-opens cover for any coach still away on the class's new day.
        session.substituteCoach = undefined;
        return record;
      });

      const previousEnd = classroom.endDate ? new Date(classroom.endDate) : null;
      const newEnd = plan.newEndDate;
      const endChanged = Boolean(newEnd && (!previousEnd || newEnd.getTime() > previousEnd.getTime()));
      if (endChanged) classroom.endDate = newEnd;

      await recalculateFutureSessionTopics(classroom, actorId);
      await classroom.save();
      await AcademyHoliday.updateOne(
        { _id: holiday._id },
        {
          $push: {
            moves: { $each: records },
            ...(endChanged ? { classroomEndDates: { classroom: classroom._id, from: previousEnd, to: newEnd } } : {}),
          },
          $inc: { classroomCount: 1 },
        }
      );
      touched.push(String(classroom._id));
      await recordActivity({
        actor: actorId,
        type: "classroom.series.holiday_shifted",
        label: `Moved ${records.length} class${records.length === 1 ? "" : "es"} for the academy holiday (${input.reason})`,
        entityType: "Classroom",
        entityId: String(classroom._id),
        metadata: { holidayId: String(holiday._id), startKey: input.startKey, endKey: input.endKey, movedSessions: records.map((record) => record.sessionId) },
      });
    } catch (error) {
      console.error("[holiday] moving classes failed", { classroom: String(classroom._id), error });
      skipped.push({ ...classroomLabel(classroom), kind: "no_slot", detail: "Could not be moved automatically - please check this series." });
      await AcademyHoliday.updateOne({ _id: holiday._id }, { $set: { skipped } });
    }
  }

  await recordActivity({
    actor: actorId,
    type: "academy.holiday.declared",
    label: `Declared an academy holiday for ${holidayRangeLabel(input)}: ${input.reason}`,
    entityType: "AcademyHoliday",
    entityId: String(holiday._id),
    metadata: { ...input, classrooms: touched.length, classesMoved: summary.classesMoved, skipped: skipped.length },
  });

  afterClassesMoved(touched);
  return { holidayId: String(holiday._id), ...summary, classrooms: touched.length };
}

/**
 * The per-session copies, leave cover and paused rosters all follow the class
 * dates. They are rebuilt in the background: on the production database a
 * session-instance sync is a write per class, and an academy-wide holiday
 * touches thousands of them.
 */
function afterClassesMoved(classroomIds: string[]) {
  if (!classroomIds.length) return;
  void (async () => {
    for (const id of classroomIds) {
      await syncClassroomSessionInstances(id).catch((error) => console.error("[holiday] session instance sync failed", { id, error }));
      syncLeaveCoverageForClassroom(id);
    }
    await syncPausedStudentRosters().catch((error) => console.error("[holiday] paused roster sync failed", error));
  })();
}

/**
 * Call the holiday off. Classes go back to their own days where nothing has
 * changed since; anything moved again by hand is listed for a person instead.
 */
export async function cancelHoliday(id: string, raw: any, actorId: string) {
  await dbConnect();
  const holiday: any = await AcademyHoliday.findById(id);
  if (!holiday) throw new HolidayError("Holiday not found.", 404);
  if (holiday.status !== "active") throw new HolidayError("This holiday is already cancelled.", 409);
  const now = new Date();
  if (holiday.endKey < academyDateKey(now)) throw new HolidayError("This holiday has already ended, so there is nothing to cancel.", 409);
  const cancelMessage = String(raw?.message || "").trim();
  if (!cancelMessage) throw new HolidayError("Write a short message telling everyone the holiday is cancelled.");
  if (cancelMessage.length > MAX_MESSAGE_LENGTH) throw new HolidayError(`Keep the message under ${MAX_MESSAGE_LENGTH} characters.`);

  // Claim the cancellation first so a double click can't run the restore twice.
  const claimed = await AcademyHoliday.findOneAndUpdate(
    { _id: holiday._id, status: "active" },
    { $set: { status: "cancelled", cancelledAt: now, cancelledBy: actorId, cancelMessage, cancelAnnouncement: { status: "pending" } } },
    { new: true }
  );
  if (!claimed) throw new HolidayError("This holiday is already cancelled.", 409);

  const movesByClassroom = new Map<string, any[]>();
  for (const move of holiday.moves || []) {
    const key = String(move.classroom);
    movesByClassroom.set(key, [...(movesByClassroom.get(key) || []), move]);
  }
  const endDates = new Map<string, any>((holiday.classroomEndDates || []).map((row: any) => [String(row.classroom), row]));

  let restoredCount = 0;
  const unrestored: any[] = [];
  const touched: string[] = [];
  for (const [classroomId, moves] of Array.from(movesByClassroom.entries())) {
    const classroom: any = await Classroom.findById(classroomId).populate("batches", "name");
    if (!classroom) {
      moves.forEach((move) => unrestored.push({ classroomId, title: "Deleted classroom", topicName: move.topicName, at: move.toScheduledFor }));
      continue;
    }
    const plan = planHolidayRestore({ sessions: classroom.generatedSessions || [], moves, now });
    plan.unrestored.forEach((move: any) => unrestored.push({ ...classroomLabel(classroom), topicName: move.topicName, at: move.toScheduledFor }));
    if (!plan.restores.length) continue;

    for (const { session, move, to, backHome } of plan.restores) {
      session.scheduledFor = to.scheduledFor;
      session.startTime = to.startTime || session.startTime;
      session.durationMinutes = to.durationMinutes;
      session.notifiedKinds = [];
      session.notes = [session.notes, "Academy holiday cancelled"].filter(Boolean).join("\n");
      if (backHome) {
        if ((move as any).fromSubstituteCoach) session.substituteCoach = (move as any).fromSubstituteCoach;
        if (!(move as any).hadOriginalDate) session.originalDate = undefined;
      }
    }
    const endRow = endDates.get(classroomId);
    if (endRow && classroom.endDate && new Date(classroom.endDate).getTime() === new Date(endRow.to).getTime()) {
      const latest = Math.max(
        endRow.from ? new Date(endRow.from).getTime() : 0,
        ...(classroom.generatedSessions || []).map((session: any) => new Date(session.scheduledFor).getTime())
      );
      classroom.endDate = new Date(latest);
    }

    await recalculateFutureSessionTopics(classroom, actorId);
    await classroom.save();
    restoredCount += plan.restores.length;
    touched.push(classroomId);
    await recordActivity({
      actor: actorId,
      type: "classroom.series.holiday_restored",
      label: `Moved ${plan.restores.length} class${plan.restores.length === 1 ? "" : "es"} back after the academy holiday was cancelled`,
      entityType: "Classroom",
      entityId: classroomId,
      metadata: { holidayId: String(holiday._id), restoredSessions: plan.restores.map((item) => String(item.session._id)) },
    });
  }

  await AcademyHoliday.updateOne({ _id: holiday._id }, { $set: { restoredCount, unrestored } });
  await recordActivity({
    actor: actorId,
    type: "academy.holiday.cancelled",
    label: `Cancelled the academy holiday for ${holidayRangeLabel(holiday)}`,
    entityType: "AcademyHoliday",
    entityId: String(holiday._id),
    metadata: { restoredCount, unrestored: unrestored.length },
  });

  afterClassesMoved(touched);
  return { restoredCount, unrestored };
}

export async function listHolidays() {
  await dbConnect();
  const rows: any[] = await AcademyHoliday.find({})
    .select("-moves")
    .populate("createdBy", "name")
    .populate("cancelledBy", "name")
    .sort({ startKey: -1 })
    .limit(100)
    .lean();
  const counts: any[] = await AcademyHoliday.aggregate([
    { $match: { _id: { $in: rows.map((row) => row._id) } } },
    { $project: { moved: { $size: { $ifNull: ["$moves", []] } } } },
  ]);
  const moved = new Map(counts.map((row) => [String(row._id), row.moved]));
  const todayKey = academyDateKey(new Date());
  return rows.map((row) => ({
    id: String(row._id),
    startKey: row.startKey,
    endKey: row.endKey,
    rangeLabel: holidayRangeLabel(row),
    reason: row.reason,
    message: row.message,
    status: row.status,
    phase: row.status === "cancelled" ? "cancelled" : row.endKey < todayKey ? "past" : row.startKey <= todayKey ? "ongoing" : "upcoming",
    canCancel: row.status === "active" && row.endKey >= todayKey,
    classesMoved: moved.get(String(row._id)) || 0,
    classroomCount: row.classroomCount || 0,
    skipped: row.skipped || [],
    unrestored: row.unrestored || [],
    restoredCount: row.restoredCount || 0,
    createdBy: row.createdBy?.name || "",
    createdAt: row.createdAt,
    cancelledBy: row.cancelledBy?.name || "",
    cancelledAt: row.cancelledAt,
    cancelMessage: row.cancelMessage || "",
    announcement: row.announcement || {},
    cancelAnnouncement: row.cancelAnnouncement || {},
  }));
}
