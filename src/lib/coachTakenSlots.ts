import "server-only";

import { Classroom } from "@/models/Classroom";
import { PENDING_SESSION_STATUSES } from "@/lib/batchVacancy";
import type { TakenSlot } from "@/lib/coachProfile";

const CLOCK = /^(\d{1,2}):(\d{2})$/;

function toMinutes(time: unknown) {
  const match = CLOCK.exec(String(time || "").trim());
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes < 24 * 60 ? minutes : null;
}

function toClock(minutes: number) {
  const clamped = Math.min(minutes, 23 * 60 + 59);
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

/**
 * The weekly classes each coach is teaching, keyed by coach id.
 *
 * A class counts only while it still has a class to come, because a finished
 * series can stay "scheduled" until someone closes it and should not hold the
 * coach's time. One-off and demo classes have no weekly slot, so they do not count.
 */
export async function getCoachTakenSlots(coachIds: string[]): Promise<Map<string, TakenSlot[]>> {
  const taken = new Map<string, TakenSlot[]>();
  if (!coachIds.length) return taken;

  const classrooms: any[] = await Classroom.find({
    $or: [{ coach: { $in: coachIds } }, { instructor: { $in: coachIds } }],
    isActive: { $ne: false },
    isSessionInstance: { $ne: true },
    isTestClassroom: { $ne: true },
    classroomType: { $ne: "demo" },
    status: { $nin: ["cancelled", "completed"] },
    generatedSessions: { $elemMatch: { scheduledFor: { $gte: new Date() }, status: { $in: PENDING_SESSION_STATUSES } } },
  })
    .select("title coach instructor batches daysOfWeek startTime durationMinutes")
    .populate("batches", "name")
    .lean();

  const wanted = new Set(coachIds);
  for (const classroom of classrooms) {
    // `instructor` is the legacy alias: it only speaks when there is no coach.
    const owner = String(classroom.coach || classroom.instructor || "");
    if (!wanted.has(owner)) continue;
    const names = (classroom.batches || []).map((batch: any) => String(batch?.name || "").trim()).filter(Boolean);
    const batches = names.length ? names : [String(classroom.title || "Class")];
    for (const entry of classroom.daysOfWeek || []) {
      for (const slot of entry?.slots || []) {
        const start = toMinutes(slot?.startTime || classroom.startTime);
        if (start === null) continue;
        const duration = Number(slot?.durationMinutes || classroom.durationMinutes || 60);
        const list = taken.get(owner) || [];
        list.push({ dayOfWeek: Number(entry.day), startTime: toClock(start), endTime: toClock(start + duration), batches });
        taken.set(owner, list);
      }
    }
  }
  return taken;
}
