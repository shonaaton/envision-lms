/**
 * Which students Learn Chess is open to.
 *
 * For now the curriculum is aimed at the start of the ladder: a student sees it
 * once they have been in a Beginner Level 1 or Level 2 classroom. Having been
 * in one is enough - a student who has since moved on to Level 3 or
 * Intermediate keeps it, along with the stars and XP they earned. Staff are not
 * filtered here; only the student role is.
 *
 * Kept free of database access so the rule can be tested; the lookup lives in
 * `studentAccess.ts`. Widen the audience by editing LEARN_CHESS_AUDIENCE.
 */

import { reportTier } from "@/lib/feedback/feedbackQuestions";

export const LEARN_CHESS_AUDIENCE = { tier: "beginner", levels: [1, 2] } as const;

export type AudienceClassroom = {
  status?: string | null;
  classroomType?: string | null;
  isTestClassroom?: boolean | null;
  isSessionInstance?: boolean | null;
  level?: string | null;
  levelName?: string | null;
};

export type AudienceCourse = {
  level?: string | null;
  levels?: Array<{ name?: string | null; order?: number | null }> | null;
};

/**
 * The sub-level a classroom teaches, 1-based. "Level 2 - Tactics" is 2 and
 * "Level 10" is 10. A level named anything else is placed by its position in
 * the course's own level list, which is what "Level N" means anyway.
 */
export function levelNumber(levelName: unknown, course?: AudienceCourse | null): number | null {
  const name = String(levelName ?? "").trim();
  if (!name) return null;
  const match = name.match(/\blevel\s*-?\s*(\d+)\b/i);
  if (match) return Number(match[1]);

  const levels = Array.isArray(course?.levels) ? [...course!.levels] : [];
  levels.sort((a, b) => Number(a?.order ?? 0) - Number(b?.order ?? 0));
  const index = levels.findIndex((level) => String(level?.name ?? "").trim().toLowerCase() === name.toLowerCase());
  return index === -1 ? null : index + 1;
}

/**
 * Whether being on this classroom's roster opens Learn Chess. A completed,
 * closed or left classroom still counts - the student was taught that level. A
 * cancelled one taught nothing, and demo, test and per-session copies are not
 * a student's course at all.
 */
export function classroomOpensLearnChess(classroom: AudienceClassroom, course?: AudienceCourse | null): boolean {
  if (classroom.status === "cancelled") return false;
  if (classroom.classroomType === "demo") return false;
  if (classroom.isTestClassroom || classroom.isSessionInstance) return false;
  // The course's tier wins over the classroom's copy, which can be stale.
  if (reportTier({ courseLevel: course?.level, classroomLevel: classroom.level }) !== LEARN_CHESS_AUDIENCE.tier) return false;
  const level = levelNumber(classroom.levelName, course);
  return level !== null && (LEARN_CHESS_AUDIENCE.levels as readonly number[]).includes(level);
}
