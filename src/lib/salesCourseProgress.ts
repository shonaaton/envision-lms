/**
 * Where each student has reached on the course ladder, indexed from classrooms.
 *
 * Split out of `salesDirectory.ts` - which is `server-only` and therefore not
 * importable from a test - because this is the part with real decisions in it:
 * which classroom counts as the current one, and what counts as a finished
 * level.
 */

export type CourseProgressRow = {
  students?: any[];
  status?: string;
  level?: string;
  levelName?: string;
  courseName?: string;
  isActive?: boolean;
};

function idOf(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

/** "Openings - Level 2", or "" when the classroom is not linked to a course. */
export function courseLabel(classroom: CourseProgressRow | null | undefined) {
  return [String(classroom?.courseName || "").trim(), String(classroom?.levelName || "").trim()].filter(Boolean).join(" - ");
}

/**
 * Expects `classrooms` already sorted newest-first, so the first running
 * classroom seen for a student is their current one.
 *
 * A cancelled classroom is neither current nor finished - it taught nothing -
 * and a closed one (`isActive: false`) is not what the student is doing now.
 */
export function indexStudentCourseProgress(classrooms: CourseProgressRow[]) {
  const running = new Map<string, CourseProgressRow>();
  const completed = new Map<string, string[]>();

  for (const classroom of classrooms || []) {
    const status = String(classroom?.status || "");
    const isCompleted = status === "completed";
    const isRunning = !isCompleted && status !== "cancelled" && classroom?.isActive !== false;
    if (!isCompleted && !isRunning) continue;

    const label = courseLabel(classroom);
    for (const student of classroom?.students || []) {
      const key = idOf(student);
      if (!key) continue;
      if (isCompleted) {
        if (!label) continue;
        const seen = completed.get(key) || [];
        // The same level can be taught to a student twice - a repeat, or a
        // transfer between batches. Sales wants the list of levels passed, not
        // a count of classrooms.
        if (!seen.includes(label)) seen.push(label);
        completed.set(key, seen);
      } else if (!running.has(key)) {
        running.set(key, classroom);
      }
    }
  }

  return { running, completed };
}
