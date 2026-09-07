/**
 * Applies the group clean-up to students who left circulation before the
 * clean-up existed.
 *
 * Deactivating an account, or pausing a student from their batch, used to change
 * only the student record: the batches and classrooms stayed open on the coach's
 * board with nobody in them. This walks every deactivated and every paused
 * student and runs what those actions now run - closing the groups a deactivated
 * student was the last attending member of (and voiding their upcoming
 * invoices), and pausing the groups a paused student was the last attending
 * member of.
 *
 * Admins can do the same thing from Closed Batches in the app; this script is the
 * terminal route for the same operation.
 *
 *   npx tsx scripts/backfill-student-lifecycle.ts            # dry run (default)
 *   npx tsx scripts/backfill-student-lifecycle.ts --apply    # write the changes
 *   npx tsx scripts/backfill-student-lifecycle.ts --limit=20 # cap the students handled
 */
import fs from "fs";
import mongoose from "mongoose";

import { dbConnect } from "../src/lib/db";
import { Batch } from "../src/models/Batch";
import { Classroom } from "../src/models/Classroom";
import { backfillGroupLifecycle, closedGroupCountsByCoach, DEACTIVATION_CLOSURE_REASON } from "../src/lib/groupLifecycle";
import { User } from "../src/models/User";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Math.max(1, Number(limitArg.split("=")[1] || 0)) : 0;

function loadEnvFile(path: string) {
  if (!fs.existsSync(path)) return;
  const text = fs.readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (process.env[key]) continue;
    process.env[key] = rest.join("=").trim().replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set. Add it to .env.local before running this script.");
  await dbConnect();

  const result = await backfillGroupLifecycle({ apply, limit, actor: { role: "system", name: "backfill script" } });

  console.log(`${apply ? "APPLY" : "DRY RUN"} - ${result.studentsScanned} student${result.studentsScanned === 1 ? "" : "s"} out of circulation.\n`);
  result.students.forEach((student) => {
    const when = student.awaySince ? ` (off since ${new Date(student.awaySince).toLocaleDateString("en-IN")})` : "";
    const verb = student.state === "deactivated" ? (apply ? "closed" : "to close") : apply ? "paused" : "to pause";
    console.log(`  - ${student.studentName} [${student.state}]${when}`);
    if (student.invoices) console.log(`      invoices ${apply ? "voided" : "to void"}: ${student.invoices}`);
    if (student.batches.length) console.log(`      batches ${verb}: ${student.batches.join(", ")}`);
    if (student.classrooms.length) console.log(`      classrooms ${verb}: ${student.classrooms.join(", ")}`);
  });
  if (!result.students.length) console.log("  Nothing left to close or pause.");

  console.log(
    `\nTotals: ${result.invoicesVoided} invoice(s) voided; ${result.batchesClosed} batch(es) and ${result.classroomsClosed} classroom(s) closed; ` +
      `${result.batchesPaused} batch(es) and ${result.classroomsPaused} classroom(s) paused, across ${result.studentsChanged} student(s).`
  );

  if (!apply) {
    console.log("\nNothing was written. Re-run with --apply to make these changes.");
    await mongoose.disconnect();
    return;
  }

  const counts = await closedGroupCountsByCoach();
  if (counts.size) {
    const coaches: any[] = await User.find({ _id: { $in: Array.from(counts.keys()) } }).select("name username").lean();
    console.log("\nClosed groups per coach:");
    coaches.forEach((coach: any) => {
      const count = counts.get(String(coach._id));
      console.log(`  - ${coach.name || coach.username}: ${count?.closedBatches || 0} batch(es), ${count?.closedClassrooms || 0} classroom(s)`);
    });
  }

  const [closedBatches, closedClassrooms, pausedBatches, pausedClassrooms] = await Promise.all([
    Batch.countDocuments({ isActive: false, closedReason: DEACTIVATION_CLOSURE_REASON }),
    Classroom.countDocuments({ isActive: false, closedReason: DEACTIVATION_CLOSURE_REASON, isSessionInstance: { $ne: true } }),
    Batch.countDocuments({ isPaused: true }),
    Classroom.countDocuments({ isPaused: true, isSessionInstance: { $ne: true } }),
  ]);
  console.log(`\nNow closed: ${closedBatches} batch(es), ${closedClassrooms} classroom(s).`);
  console.log(`Now paused: ${pausedBatches} batch(es), ${pausedClassrooms} classroom(s).`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
