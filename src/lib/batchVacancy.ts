import "server-only";

import { dbConnect } from "@/lib/db";
import { Batch } from "@/models/Batch";
import { Classroom } from "@/models/Classroom";
import { User } from "@/models/User";
import { courseTierLabel } from "@/lib/courseTiers";

/**
 * Free-slot view of the group batches, for sales calls.
 *
 * A batch on its own carries only a roster, a coach and a level - the schedule,
 * course, level name and session list all live on the `Classroom` that points
 * back at it through `Classroom.batches`. So everything below is a join, and a
 * batch with no live series classroom simply reports what it does know.
 */

/**
 * Individual classes are named with a "PIC" prefix. This is a data convention in
 * the academy's own batch names, not a modelled field - nothing in the schema
 * distinguishes an individual batch from a group one - so the rule lives here, in
 * one place, rather than being spelled out at each call site.
 */
export const INDIVIDUAL_BATCH_PREFIX = /^\s*PIC\b/i;

export function isIndividualBatch(name: string) {
  return INDIVIDUAL_BATCH_PREFIX.test(String(name || ""));
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Sessions still to be delivered.
 *
 * Mirrors the pending test already used by the classroom API - a session counts
 * as pending while it is scheduled or rescheduled and has not actually run. A
 * cancelled or missed class is not coming back, so it is not "left".
 */
const PENDING_STATUSES = new Set(["scheduled", "rescheduled", "ongoing", "in_progress"]);

export type BatchSlot = { day: number; label: string; startTime: string; durationMinutes: number };

export type BatchVacancyRow = {
  id: string;
  name: string;
  level: string;
  coach: string;
  coachPhone: string;
  capacity: number;
  filled: number;
  freeSlots: number;
  scheduleLabel: string;
  slots: BatchSlot[];
  courseName: string;
  levelName: string;
  currentTopic: string;
  classesLeft: number | null;
  classesTotal: number | null;
  classesDone: number | null;
  nextClassAt: string | null;
  students: Array<{ name: string; enrolledAt: string | null; paused: boolean }>;
  upcomingTopics: string[];
  classroomTitle: string;
};

export type BatchVacancyPayload = {
  rows: BatchVacancyRow[];
  levels: string[];
  courses: string[];
  coaches: string[];
  generatedAt: string;
};

function id(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

function slotsOf(classroom: any): BatchSlot[] {
  const slots: BatchSlot[] = [];
  for (const entry of classroom?.daysOfWeek || []) {
    const day = Number(entry?.day ?? 0);
    for (const slot of entry?.slots || []) {
      slots.push({
        day,
        label: DAY_NAMES[day] || "",
        startTime: String(slot?.startTime || classroom?.startTime || ""),
        durationMinutes: Number(slot?.durationMinutes || classroom?.durationMinutes || 60),
      });
    }
  }
  return slots.sort((a, b) => a.day - b.day || a.startTime.localeCompare(b.startTime));
}

export async function getBatchVacancy(): Promise<BatchVacancyPayload> {
  await dbConnect();

  const batches = await Batch.find({ isActive: true })
    .select("_id name level capacity coach students studentEnrollments")
    .populate("coach", "name phone countryCode")
    .sort({ name: 1 })
    .lean();

  // Only group batches. Both filters are the same business rule from two angles:
  // a PIC batch is individual by name, and a batch that never grew past one
  // student is being run as one regardless of what it is called.
  const groupBatches = (batches as any[]).filter((batch) => !isIndividualBatch(batch.name) && (batch.students || []).length > 1);
  if (!groupBatches.length) {
    return { rows: [], levels: [], courses: [], coaches: [], generatedAt: new Date().toISOString() };
  }

  const batchIds = groupBatches.map((batch) => batch._id);
  const studentIds = Array.from(new Set(groupBatches.flatMap((batch) => (batch.students || []).map(id)))).filter(Boolean);

  const [classrooms, students] = await Promise.all([
    Classroom.find({
      batches: { $in: batchIds },
      isActive: { $ne: false },
      // Session instances are per-class copies of a series; counting them would
      // report the same batch many times over.
      isSessionInstance: { $ne: true },
      status: { $ne: "cancelled" },
    })
      .select("title batches coach instructor courseName levelName topicName daysOfWeek startTime durationMinutes generatedSessions sessionPlan classroomType updatedAt")
      .populate("coach", "name phone countryCode")
      .populate("instructor", "name phone countryCode")
      .sort({ updatedAt: -1 })
      .lean(),
    User.find({ _id: { $in: studentIds } }).select("_id name isActive isPaused").lean(),
  ]);

  const studentById = new Map<string, any>();
  for (const student of students as any[]) studentById.set(id(student._id), student);

  // Newest-updated classroom wins when a batch somehow has more than one, and a
  // series is preferred over a one-off because that is what carries the schedule.
  const classroomByBatch = new Map<string, any>();
  for (const classroom of classrooms as any[]) {
    for (const batchRef of classroom.batches || []) {
      const key = id(batchRef);
      const current = classroomByBatch.get(key);
      if (!current) {
        classroomByBatch.set(key, classroom);
        continue;
      }
      if (current.classroomType !== "series" && classroom.classroomType === "series") {
        classroomByBatch.set(key, classroom);
      }
    }
  }

  const now = Date.now();

  const rows: BatchVacancyRow[] = groupBatches.map((batch) => {
    const classroom = classroomByBatch.get(id(batch._id));
    const enrolledAtById = new Map<string, Date>();
    for (const entry of batch.studentEnrollments || []) {
      const key = id(entry?.student);
      if (key && entry?.enrolledAt) enrolledAtById.set(key, new Date(entry.enrolledAt));
    }

    const roster = (batch.students || [])
      .map((ref: any) => studentById.get(id(ref)))
      .filter((student: any) => student && student.isActive !== false);

    // A paused student is out of classes but still holds their seat, so they are
    // not a free slot. Only a student who has left frees one up.
    const filled = roster.length;
    const capacity = Math.max(1, Number(batch.capacity || 8));

    const sessions = (classroom?.generatedSessions || []) as any[];
    const pending = sessions.filter(
      (session) => PENDING_STATUSES.has(String(session?.status || "")) && !session?.actualEndedAt,
    );
    const done = sessions.filter((session) => String(session?.status || "") === "completed");
    const upcoming = pending
      .filter((session) => session?.scheduledFor && new Date(session.scheduledFor).getTime() >= now)
      .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());

    const coachDoc = (classroom?.coach as any) || (classroom?.instructor as any) || (batch.coach as any);
    const slots = slotsOf(classroom);

    return {
      id: id(batch._id),
      name: String(batch.name || ""),
      level: courseTierLabel(batch.level || "beginner") || "Beginner",
      coach: String(coachDoc?.name || "Unassigned"),
      coachPhone: [coachDoc?.countryCode, coachDoc?.phone].map((part: any) => String(part || "").trim()).filter(Boolean).join(" "),
      capacity,
      filled,
      freeSlots: Math.max(0, capacity - filled),
      scheduleLabel: slots.length
        ? slots.map((slot) => `${slot.label} ${slot.startTime}`).join(" - ")
        : "Schedule not set",
      slots,
      courseName: String(classroom?.courseName || ""),
      levelName: String(classroom?.levelName || ""),
      currentTopic: String(classroom?.topicName || ""),
      classesLeft: classroom ? pending.length : null,
      classesTotal: classroom ? sessions.length : null,
      classesDone: classroom ? done.length : null,
      nextClassAt: upcoming[0]?.scheduledFor ? new Date(upcoming[0].scheduledFor).toISOString() : null,
      students: roster.map((student: any) => ({
        name: String(student.name || "").split(" ")[0] || "Student",
        enrolledAt: enrolledAtById.get(id(student._id))?.toISOString() || null,
        paused: Boolean(student.isPaused),
      })),
      upcomingTopics: upcoming.slice(0, 8).map((session) => String(session?.topicName || "")).filter(Boolean),
      classroomTitle: String(classroom?.title || ""),
    };
  });

  // Batches sales can actually fill come first.
  rows.sort((a, b) => b.freeSlots - a.freeSlots || a.name.localeCompare(b.name));

  const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean))).sort();

  return {
    rows,
    levels: unique(rows.map((row) => row.levelName || row.level)),
    courses: unique(rows.map((row) => row.courseName)),
    coaches: unique(rows.map((row) => row.coach)),
    generatedAt: new Date().toISOString(),
  };
}
