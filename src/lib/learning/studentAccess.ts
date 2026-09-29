import "server-only";

import { redirect } from "next/navigation";
import { dbConnect } from "@/lib/db";
import { classroomOpensLearnChess } from "@/lib/learning/audience";
import { cachedPermissionValue } from "@/lib/permissionCache";
import { Classroom } from "@/models/Classroom";
import { Course } from "@/models/Course";

function idOf(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

/**
 * Whether this student may use Learn Chess (see `audience.ts` for the rule).
 *
 * Asked by the dashboard layout on every page a student opens, so it is cached
 * with the pilot-feature memberships: at most two reads per student per 30
 * seconds. Being added to a Beginner Level 1 class shows the link within that
 * window.
 */
export function canStudentUseLearnChess(studentId: string): Promise<boolean> {
  if (!studentId) return Promise.resolve(false);
  return cachedPermissionValue("cohorts", `learnChess:${studentId}`, async () => {
    await dbConnect();
    const classrooms: any[] = await Classroom.find({ students: studentId, status: { $ne: "cancelled" } })
      .select("status classroomType isTestClassroom isSessionInstance level levelName course")
      .lean();
    if (!classrooms.length) return false;

    const courseIds = Array.from(new Set(classrooms.map((classroom) => idOf(classroom.course)).filter(Boolean)));
    const courses: any[] = courseIds.length
      ? await Course.find({ _id: { $in: courseIds } }).select("level levels.name levels.order").lean()
      : [];
    const courseById = new Map(courses.map((course) => [idOf(course), course]));

    return classrooms.some((classroom) => classroomOpensLearnChess(classroom, courseById.get(idOf(classroom.course)) || null));
  });
}

/**
 * Sends a student who may not use Learn Chess to the dashboard; staff pass.
 *
 * Every /learn page calls this before it loads anything. Next renders a page in
 * parallel with its layout, so a redirect from learn/layout.tsx alone still
 * builds the page and streams its content ahead of the redirect.
 */
export async function requireLearnChessAccess(user: { id?: string; role?: string } | null | undefined) {
  if (user?.role !== "student") return;
  const allowed = await canStudentUseLearnChess(String(user.id || "")).catch((error) => {
    console.error("Learn Chess eligibility lookup failed; keeping the student out.", error);
    return false;
  });
  if (!allowed) redirect("/dashboard?restricted=1");
}
