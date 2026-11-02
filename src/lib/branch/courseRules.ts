/**
 * Course progress for an offline-branch student. Pure: no database.
 *
 * The branch teaches the academy's own courses, but has no classroom planning
 * each session's topic in advance. Where a child has reached is read back from
 * the registers instead: a topic is done once the student has been taught it
 * (present or late, with that topic) for as many classes as the syllabus gives it.
 */

export type CourseTopic = { id: string; name: string; sessionCount: number };
export type CourseLevel = { id: string; name: string; topics: CourseTopic[] };

export type TopicProgress = CourseTopic & { taught: number; done: boolean };

export type LevelProgress = {
  topics: TopicProgress[];
  done: number;
  total: number;
  /** The first topic still to finish, in syllabus order; empty when the level is complete. */
  next: string;
  complete: boolean;
};

/** How register topics are compared with syllabus topics: case and spacing don't matter. */
export const topicKey = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** Classes taught per topic, from the topics on a student's attended register lines. */
export function countTopics(lines: { topic: string; count?: number }[]) {
  const counts = new Map<string, number>();
  for (const line of lines) {
    const key = topicKey(line.topic);
    if (key) counts.set(key, (counts.get(key) || 0) + (line.count ?? 1));
  }
  return counts;
}

export function levelProgress(level: CourseLevel | null | undefined, taught: Map<string, number>): LevelProgress {
  const topics = (level?.topics || []).map((topic) => {
    const sessionCount = Math.max(1, Number(topic.sessionCount) || 1);
    const count = taught.get(topicKey(topic.name)) || 0;
    return { ...topic, sessionCount, taught: count, done: count >= sessionCount };
  });
  const done = topics.filter((topic) => topic.done).length;
  return {
    topics,
    done,
    total: topics.length,
    next: topics.find((topic) => !topic.done)?.name || "",
    complete: topics.length > 0 && done === topics.length,
  };
}

type RawCourse = { _id?: unknown; name?: string; level?: string; levels?: any[] };

const byOrder = (a: any, b: any) => (Number(a.order) || 0) - (Number(b.order) || 0);

/** A course as the branch screens use it: levels and topics in syllabus order. */
export function shapeCourse(course: RawCourse) {
  return {
    id: String(course._id ?? ""),
    name: String(course.name || ""),
    tier: String(course.level || ""),
    levels: [...(course.levels || [])]
      .map((level, index) => ({ level, index }))
      .sort((a, b) => byOrder(a.level, b.level) || a.index - b.index)
      .map(({ level }) => ({
        id: String(level._id ?? ""),
        name: String(level.name || ""),
        topics: [...(level.topics || [])]
          .map((topic, index) => ({ topic, index }))
          .sort((a, b) => byOrder(a.topic, b.topic) || a.index - b.index)
          .map(({ topic }) => ({ id: String(topic._id ?? ""), name: String(topic.name || ""), sessionCount: Math.max(1, Number(topic.sessionCount) || 1) })),
      })),
  };
}

export type BranchCourse = ReturnType<typeof shapeCourse>;
