/**
 * Applies the deactivation clean-up to students who were switched off before the
 * clean-up existed.
 *
 * Deactivating an account used to change only the login: the batches and
 * classrooms stayed open on the coach's board, and the invoices ahead of the
 * student kept standing. This walks every `isActive: false` student and runs the
 * same closure the API now runs - voiding upcoming invoices, and closing the
 * batches and classrooms they were the last active member of.
 *
 * Admins can do the same thing from Closed Batches in the app; this script is the
 * terminal route for the same operation.
 *
 *   npx tsx scripts/backfill-student-deactivation.ts            # dry run (default)
 *   npx tsx scripts/backfill-student-deactivation.ts --apply    # write the changes
 *   npx tsx scripts/backfill-student-deactivation.ts --limit=20 # cap the students handled
 */
import fs from "fs";
import mongoose from "mongoose";

import { dbConnect } from "../src/lib/db";
import { Batch } from "../src/models/Batch";
import { Classroom } from "../src/models/Classroom";
import { backfillStudentDeactivations, closedGroupCountsByCoach, DEACTIVATION_CLOSURE_REASON } from "../src/lib/studentDeactivation";
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

  const result = await backfillStudentDeactivations({ apply, limit, actor: { role: "system", name: "backfill script" } });

  console.log(`${apply ? "APPLY" : "DRY RUN"} - ${result.studentsScanned} deactivated student${result.studentsScanned === 1 ? "" : "s"} scanned.\n`);
  result.students.forEach((student) => {
    const when = student.deactivatedAt ? ` (off since ${new Date(student.deactivatedAt).toLocaleDateString("en-IN")})` : "";
    console.log(`  - ${student.studentName}${when}`);
    if (student.invoices) console.log(`      invoices ${apply ? "voided" : "to void"}: ${student.invoices}`);
    if (student.batches.length) console.log(`      batches ${apply ? "closed" : "to close"}: ${student.batches.join(", ")}`);
    if (student.classrooms.length) console.log(`      classrooms ${apply ? "closed" : "to close"}: ${student.classrooms.join(", ")}`);
  });
  if (!result.students.length) console.log("  Nothing left to close.");

  console.log(
    `\nTotals: ${result.invoicesVoided} invoice(s), ${result.batchesClosed} batch(es), ${result.classroomsClosed} classroom(s) across ${result.studentsChanged} student(s).`
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

  const closedBatches = await Batch.countDocuments({ isActive: false, closedReason: DEACTIVATION_CLOSURE_REASON });
  const closedClassrooms = await Classroom.countDocuments({
    isActive: false,
    closedReason: DEACTIVATION_CLOSURE_REASON,
    isSessionInstance: { $ne: true },
  });
  console.log(`\nNow closed by deactivation: ${closedBatches} batch(es), ${closedClassrooms} classroom(s).`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
