import "server-only";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { Course } from "@/models/Course";
import { BranchAttendance, BranchStudent } from "@/models/Branch";
import type { BranchKey } from "./scope";
import { BranchError } from "./errors";
import { countTopics, levelProgress, shapeCourse, type BranchCourse, type LevelProgress } from "./courseRules";

/**
 * The academy's courses at the branch. The branch teaches the same syllabus as
 * online, read straight from the online `Course` documents (only online admins
 * edit them); each student is put on one course level, and their progress is
 * read from the topics on their registers (courseRules.ts).
 */

const id = (value: unknown) => String((value as any)?._id ?? value ?? "");
const isObjectId = (value: unknown) => typeof value === "string" && Types.ObjectId.isValid(value);

/** Every active course, for the pickers. */
export async function courseCatalog(): Promise<BranchCourse[]> {
  await dbConnect();
  const courses: any[] = await Course.find({ isActive: { $ne: false } }).select("name level levels").sort({ name: 1 }).lean();
  return courses.map(shapeCourse);
}

/**
 * The update that puts students on `courseId` / `levelId`. An empty course
 * takes them off any course.
 */
export async function checkCourseInput(input: any) {
  const courseId = String(input?.courseId ?? "");
  if (!courseId) return { $unset: { course: 1, courseName: 1, courseLevel: 1, courseLevelName: 1, courseLevelSince: 1 } };
  if (!isObjectId(courseId)) throw new BranchError("Course not found.", 404);
  const course: any = await Course.findOne({ _id: courseId, isActive: { $ne: false } }).select("name levels._id levels.name").lean();
  if (!course) throw new BranchError("That course is no longer available.", 404);
  const levels: any[] = course.levels || [];
  const levelId = String(input?.levelId ?? "");
  const level = levels.find((item) => id(item) === levelId);
  if (!level && levels.length) throw new BranchError(`Pick the level of ${course.name}.`);
  return {
    course: course._id,
    courseName: course.name as string,
    courseLevel: level?._id,
    courseLevelName: (level?.name as string) || "",
  };
}

/**
 * Puts students on a course level. `courseLevelSince` only moves for a student
 * whose level actually changes, so saving the form again keeps the date.
 */
export async function setStudentsCourse(branch: BranchKey, studentIds: string[], input: any, actorId?: string) {
  await dbConnect();
  const ids = [...new Set(studentIds.filter(isObjectId))];
  if (!ids.length) throw new BranchError("Pick at least one student.");
  if (ids.length > 300) throw new BranchError("Too many students at once.");
  const update: any = await checkCourseInput(input);
  if (update.$unset) {
    await BranchStudent.updateMany({ _id: { $in: ids }, branch }, update);
  } else {
    const fields = { course: update.course, courseName: update.courseName, courseLevelName: update.courseLevelName };
    const level = update.courseLevel;
    await BranchStudent.bulkWrite([
      // Already on this level: refresh the names only.
      {
        updateMany: {
          filter: { _id: { $in: ids }, branch, course: update.course, courseLevel: level ?? null },
          update: { $set: fields },
        },
      },
      {
        updateMany: {
          filter: { _id: { $in: ids }, branch, $or: [{ course: { $ne: update.course } }, { courseLevel: { $ne: level ?? null } }] },
          update: level ? { $set: { ...fields, courseLevel: level, courseLevelSince: new Date() } } : { $set: { ...fields, courseLevelSince: new Date() }, $unset: { courseLevel: 1 } },
        },
      },
    ]);
  }
  if (actorId) {
    void recordActivity({
      actor: actorId,
      type: "branch.course_set",
      label: update.$unset
        ? `Took ${ids.length} student${ids.length === 1 ? "" : "s"} off their course`
        : `Put ${ids.length} student${ids.length === 1 ? "" : "s"} on ${[update.courseName, update.courseLevelName].filter(Boolean).join(" - ")}`,
      entityType: "BranchStudent",
      entityId: ids[0],
      metadata: { branch, count: ids.length },
    });
  }
  return { updated: ids.length };
}

export type StudentCourse = {
  courseId: string;
  courseName: string;
  levelId: string;
  levelName: string;
  since: string | null;
} & LevelProgress;

/**
 * Course progress for each student who is on a course, keyed by BranchStudent
 * id. One aggregate counts every attended register line's topic.
 */
export async function courseProgressFor(branch: BranchKey, students: any[]) {
  const out = new Map<string, StudentCourse>();
  const placed = students.filter((student) => student?.course);
  if (!placed.length) return out;
  await dbConnect();
  const studentIds = placed.map((student) => student._id);
  const [courses, lines]: [any[], any[]] = await Promise.all([
    Course.find({ _id: { $in: [...new Set(placed.map((student) => id(student.course)))] } }).select("name level levels").lean(),
    BranchAttendance.aggregate([
      { $match: { branch, "records.student": { $in: studentIds } } },
      { $unwind: "$records" },
      {
        $match: {
          "records.student": { $in: studentIds },
          "records.status": { $in: ["present", "late"] },
          "records.topic": { $nin: [null, ""] },
        },
      },
      { $group: { _id: { student: "$records.student", topic: "$records.topic" }, count: { $sum: 1 } } },
    ]),
  ]);
  const courseById = new Map(courses.map((course) => [id(course), shapeCourse(course)]));
  const linesByStudent = new Map<string, { topic: string; count: number }[]>();
  for (const line of lines) {
    const key = id(line._id.student);
    const list = linesByStudent.get(key) || [];
    list.push({ topic: line._id.topic, count: line.count });
    linesByStudent.set(key, list);
  }
  for (const student of placed) {
    const course = courseById.get(id(student.course));
    const level = course?.levels.find((item) => item.id === id(student.courseLevel)) || null;
    out.set(id(student), {
      courseId: id(student.course),
      // The course may since have been renamed or removed; the snapshot still reads.
      courseName: course?.name || student.courseName || "",
      levelId: level?.id || "",
      levelName: level?.name || student.courseLevelName || "",
      since: student.courseLevelSince ? new Date(student.courseLevelSince).toISOString() : null,
      ...levelProgress(level, countTopics(linesByStudent.get(id(student)) || [])),
    });
  }
  return out;
}

/** One student's course, for their own page and the staff history drawer. */
export async function studentCourse(branch: BranchKey, studentId: unknown) {
  await dbConnect();
  const student: any = await BranchStudent.findOne({ _id: studentId, branch }).select("course courseName courseLevel courseLevelName courseLevelSince").lean();
  if (!student) return null;
  return (await courseProgressFor(branch, [student])).get(id(student)) || null;
}
