/**
 * Moves classrooms over to the coach their batch was handed to.
 *
 * Until 2026-10-01, changing a batch's coach from the batch form updated only
 * `Batch.coach`. The batch's classrooms still named the old coach, so the
 * Classrooms page coach filter (and the coaches' own lists) kept the batch
 * under the old coach. The batch form now hands the classrooms over too (see
 * src/lib/batchCoachHandover.ts). This repairs the batches changed before that.
 *
 * Where it finds the change date: the "permanent_coach_changed" WhatsApp sent
 * to the new coach. Classes held before that date stay credited to the old
 * coach. Classes after it go to the new coach, unless the old coach was
 * recorded as having taught or covered them.
 *
 * Skipped unless asked:
 *   - a batch where some classrooms already match the batch coach (it may be a
 *     batch shared with another coach's classroom) -> --include-mixed
 *   - a batch with no change message on record -> --fallback-now (treats the
 *     change as happening now, so every class already held stays with the old coach)
 *
 *   npx tsx scripts/repair-batch-coach-classrooms.ts            # dry run (default)
 *   npx tsx scripts/repair-batch-coach-classrooms.ts --apply    # write the changes
 *   npx tsx scripts/repair-batch-coach-classrooms.ts --batch=<batchId>
 */
import fs from "fs";
import mongoose from "mongoose";
import { dbConnect } from "../src/lib/db";
import { Batch } from "../src/models/Batch";
import { Classroom } from "../src/models/Classroom";
import { ClassroomSession } from "../src/models/ClassroomLive";
import { Attendance } from "../src/models/Attendance";
import { WhatsAppMessage } from "../src/models/WhatsApp";
import { User } from "../src/models/User";
import { isUpcomingSession } from "../src/lib/classroomCoachChange";
import { syncClassroomSessionInstances } from "../src/lib/classroomSessionInstances";
import { transferPendingFeedbackToCoach } from "../src/lib/feedback/feedbackService";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const includeMixed = args.includes("--include-mixed");
const fallbackNow = args.includes("--fallback-now");
const batchArg = args.find((arg) => arg.startsWith("--batch="))?.split("=")[1]?.trim() || "";

function loadEnvFile(path: string) {
  if (!fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (process.env[key]) continue;
    process.env[key] = rest.join("=").trim().replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

function idOf(value: any) {
  return String(value?._id || value || "");
}

async function changeDate(batchId: string, coachId: string): Promise<Date | null> {
  const message: any = await WhatsAppMessage.findOne({
    "rawPayload.metadata.kind": "permanent_coach_changed",
    "rawPayload.metadata.batchId": batchId,
    "rawPayload.metadata.coachId": coachId,
  })
    .sort({ createdAt: -1 })
    .select("sentAt createdAt")
    .lean();
  const at = message?.sentAt || message?.createdAt;
  return at ? new Date(at) : null;
}

/** Re-plays the hand-over as of `changedAt`; returns the sessions that moved to the new coach. */
function handOver(classroom: any, oldCoachId: string, newCoachId: string, changedAt: Date, now: Date) {
  const moved: string[] = [];
  let pinned = 0;
  for (const session of classroom.generatedSessions || []) {
    const startsAt = new Date(session.scheduledFor).getTime();
    const minutes = Math.max(15, Number(session.durationMinutes || classroom.durationMinutes || 60));
    const heldBeforeChange = Number.isFinite(startsAt) && startsAt + minutes * 60000 <= changedAt.getTime();
    if (heldBeforeChange) {
      if (!session.assignedCoach) session.assignedCoach = oldCoachId;
      if (!session.conductedBy && !session.substituteCoach) {
        session.conductedBy = oldCoachId;
        pinned += 1;
      }
      continue;
    }
    const cover = idOf(session.substituteCoach);
    if (isUpcomingSession(session, classroom.durationMinutes, now) && (cover === oldCoachId || cover === newCoachId)) {
      session.substituteCoach = undefined;
    }
    if (!session.conductedBy && !session.substituteCoach) moved.push(idOf(session._id));
  }
  classroom.coach = newCoachId;
  classroom.instructor = newCoachId;
  return { moved, pinned };
}

async function main() {
  await dbConnect();
  const now = new Date();
  const batches: any[] = await Batch.find({ coach: { $ne: null }, ...(batchArg ? { _id: batchArg } : {}) })
    .select("_id name coach")
    .lean();
  const coachNames = new Map<string, string>();
  const coachName = async (id: string) => {
    if (!id) return "(none)";
    if (!coachNames.has(id)) coachNames.set(id, String(((await User.findById(id).select("name").lean()) as any)?.name || id));
    return coachNames.get(id)!;
  };

  let repaired = 0;
  let skipped = 0;
  for (const batch of batches) {
    const batchId = idOf(batch._id);
    const batchCoachId = idOf(batch.coach);
    const classrooms: any[] = await Classroom.find({
      batches: batchId,
      isSessionInstance: { $ne: true },
      classroomType: { $ne: "demo" },
      status: { $nin: ["completed", "cancelled"] },
    });
    const stale = classrooms.filter((classroom) => idOf(classroom.coach || classroom.instructor) !== batchCoachId);
    if (!stale.length) continue;

    const mixed = stale.length < classrooms.length;
    const changedAt = await changeDate(batchId, batchCoachId);
    const header = `${batch.name} -> batch coach ${await coachName(batchCoachId)}`;
    if (mixed && !includeMixed) {
      console.log(`SKIP (mixed: ${classrooms.length - stale.length} classroom(s) already on the batch coach) ${header}`);
      for (const classroom of stale) console.log(`    ${classroom.title} [${idOf(classroom._id)}] coach ${await coachName(idOf(classroom.coach || classroom.instructor))}`);
      skipped += 1;
      continue;
    }
    if (!changedAt && !fallbackNow) {
      console.log(`SKIP (no change date on record) ${header}`);
      for (const classroom of stale) console.log(`    ${classroom.title} [${idOf(classroom._id)}] coach ${await coachName(idOf(classroom.coach || classroom.instructor))}`);
      skipped += 1;
      continue;
    }
    const effectiveAt = changedAt || now;
    console.log(`${apply ? "FIX" : "WOULD FIX"} ${header} (changed ${effectiveAt.toISOString()}${changedAt ? "" : ", assumed now"})`);
    for (const classroom of stale) {
      const oldCoachId = idOf(classroom.coach || classroom.instructor);
      const classroomId = idOf(classroom._id);
      const { moved, pinned } = handOver(classroom, oldCoachId, batchCoachId, effectiveAt, now);
      console.log(`    ${classroom.title} [${classroomId}] ${await coachName(oldCoachId)} -> ${await coachName(batchCoachId)}: ${moved.length} class(es) move, ${pinned} held class(es) pinned to the old coach`);
      if (!apply) continue;
      await classroom.save();
      if (moved.length) {
        await Promise.all([
          ClassroomSession.updateMany({ classroom: classroomId, scheduledSessionId: { $in: moved }, coach: oldCoachId }, { $set: { coach: batchCoachId } }),
          Attendance.updateMany({ classroom: classroomId, scheduledSessionId: { $in: moved }, coach: oldCoachId }, { $set: { coach: batchCoachId } }),
        ]);
      }
      await syncClassroomSessionInstances(classroomId);
      if (oldCoachId) await transferPendingFeedbackToCoach({ classroomId, fromCoachId: oldCoachId, toCoachId: batchCoachId });
    }
    repaired += 1;
  }
  console.log(`\n${apply ? "Repaired" : "Would repair"} ${repaired} batch(es); skipped ${skipped}.${apply ? "" : " Dry run - pass --apply to write."}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
