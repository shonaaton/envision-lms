/**
 * Re-points the copies of a course name back at the course itself.
 *
 * Every classroom and homework template stores its own copy of `courseName`,
 * `levelName` and the coarse `level` tier, and every course-wise filter in the
 * app is built from those copies. Saving a course now pushes a rename out to
 * them (see src/lib/courseRenames.ts), but a course renamed before that existed
 * left its copies behind - this repairs those.
 *
 * What it can fix on its own: any row that still carries the course's ObjectId.
 * The course is the master, so `courseName` and the tier are simply overwritten
 * from it.
 *
 * What it cannot: a renamed LEVEL. A classroom stores only the level's name, not
 * its id, so once "Advanced Level 1" became "Masters Level 1" there is nothing
 * left to link the two. Guessing would rewrite the wrong classrooms, so those
 * are only reported - move them from the admin screens.
 *
 *   npx tsx scripts/resync-course-names.ts            # dry run (default)
 *   npx tsx scripts/resync-course-names.ts --apply    # write the changes
 *   npx tsx scripts/resync-course-names.ts --course="Masters Course"
 */
import fs from "fs";
import mongoose from "mongoose";
import { dbConnect } from "../src/lib/db";
import { AssignmentTemplate } from "../src/models/AssignmentTemplate";
import { Classroom } from "../src/models/Classroom";
import { Course } from "../src/models/Course";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const courseArg = args.find((arg) => arg.startsWith("--course="))?.split("=").slice(1).join("=").trim() || "";

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

function text(value: any) {
  return String(value ?? "").trim();
}

type Fix = { id: string; label: string; field: string; from: string; to: string };
type Orphan = { id: string; label: string; courseName: string; levelName: string };

async function main() {
  await dbConnect();

  const courseFilter = courseArg ? { name: courseArg } : {};
  const courses: any[] = await Course.find(courseFilter).lean();
  if (!courses.length) {
    console.log(courseArg ? `No course named "${courseArg}".` : "No courses found.");
    return;
  }

  const byId = new Map<string, any>();
  for (const course of courses) byId.set(String(course._id), course);
  const courseIds = [...byId.keys()];

  const [classrooms, templates] = await Promise.all([
    Classroom.find({ course: { $in: courseIds } }).select("_id title course courseName level levelName").lean(),
    AssignmentTemplate.find({ course: { $in: courseIds } }).select("_id title course courseName level levelName").lean(),
  ]);

  const classroomFixes: Fix[] = [];
  const templateFixes: Fix[] = [];
  const orphanLevels: Orphan[] = [];

  function inspect(rows: any[], labelKey: string, fixes: Fix[], isClassroom: boolean) {
    for (const row of rows) {
      const course = byId.get(String(row.course));
      if (!course) continue;
      const label = text(row[labelKey]) || String(row._id);

      const expectedName = text(course.name);
      if (expectedName && text(row.courseName) !== expectedName) {
        fixes.push({ id: String(row._id), label, field: "courseName", from: text(row.courseName) || "(empty)", to: expectedName });
      }

      // A classroom never stores "mixed" - the create route folds it to beginner.
      const expectedTier = isClassroom && course.level === "mixed" ? "beginner" : text(course.level);
      if (expectedTier && text(row.level) !== expectedTier) {
        fixes.push({ id: String(row._id), label, field: "level", from: text(row.level) || "(empty)", to: expectedTier });
      }

      const levelName = text(row.levelName);
      const known = (course.levels || []).some((level: any) => text(level.name).toLowerCase() === levelName.toLowerCase());
      if (levelName && !known) {
        orphanLevels.push({ id: String(row._id), label, courseName: expectedName, levelName });
      }
    }
  }

  inspect(classrooms, "title", classroomFixes, true);
  inspect(templates, "title", templateFixes, false);

  console.log(`Courses scanned: ${courses.length}`);
  console.log(`Classrooms linked: ${classrooms.length}   Templates linked: ${templates.length}\n`);

  for (const [heading, fixes] of [["Classrooms", classroomFixes], ["Homework templates", templateFixes]] as const) {
    console.log(`${heading}: ${fixes.length} field${fixes.length === 1 ? "" : "s"} out of date`);
    for (const fix of fixes.slice(0, 40)) {
      console.log(`  ${fix.label} | ${fix.field}: "${fix.from}" -> "${fix.to}"`);
    }
    if (fixes.length > 40) console.log(`  ... and ${fixes.length - 40} more`);
    console.log("");
  }

  if (orphanLevels.length) {
    console.log(`Level names that match no level on their course: ${orphanLevels.length}`);
    console.log("These cannot be repaired automatically - a classroom stores the level name, not its id.");
    const grouped = new Map<string, number>();
    for (const orphan of orphanLevels) {
      const key = `${orphan.courseName} | ${orphan.levelName}`;
      grouped.set(key, (grouped.get(key) || 0) + 1);
    }
    for (const [key, count] of [...grouped.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${key}  (${count} record${count === 1 ? "" : "s"})`);
    }
    console.log("");
  }

  const total = classroomFixes.length + templateFixes.length;
  if (!total) {
    console.log("Nothing to change.");
  } else if (!apply) {
    console.log(`Dry run - nothing written. Re-run with --apply to update ${total} field${total === 1 ? "" : "s"}.`);
  } else {
    for (const [model, fixes] of [[Classroom, classroomFixes], [AssignmentTemplate, templateFixes]] as const) {
      for (const fix of fixes) {
        await (model as any).updateOne({ _id: fix.id }, { $set: { [fix.field]: fix.to } });
      }
    }
    console.log(`Applied ${total} field update${total === 1 ? "" : "s"}.`);
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("FAILED:", error?.message || error);
  process.exit(1);
});
