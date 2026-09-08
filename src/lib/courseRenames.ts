/**
 * A course name, level name and topic name are copied onto every classroom and
 * homework template built from that course, and every course-wise filter in the
 * app is built from those copies rather than from the course itself. So renaming
 * a course in the planner used to change one document and leave every filter in
 * the academy showing the old name.
 *
 * This makes the course the master: a rename in the planner is diffed against
 * the stored course and pushed out to the copies, so the filters follow.
 *
 * Levels and topics are matched by their subdocument `_id`, which is why the
 * course routes now preserve those ids instead of regenerating them on save -
 * without a stable id, a rename is indistinguishable from a delete plus an add.
 */
import { AssignmentTemplate } from "@/models/AssignmentTemplate";
import { Classroom } from "@/models/Classroom";
import { User } from "@/models/User";
import { normalizeTopicKey } from "@/lib/assignmentAutomation";
import { classroomTier } from "@/lib/courseTiers";

export type Rename = { from: string; to: string };

export type CourseRenamePlan = {
  course: Rename | null;
  tier: Rename | null;
  levels: Rename[];
  topics: Rename[];
};

export type CourseRenameSummary = {
  classrooms: number;
  templates: number;
  students: number;
  plan: CourseRenamePlan;
};

function text(value: any) {
  return String(value ?? "").trim();
}

function subdocumentId(value: any) {
  return String(value?._id || "").trim();
}

export function hasRenames(plan: CourseRenamePlan) {
  return Boolean(plan.course || plan.tier || plan.levels.length || plan.topics.length);
}

/**
 * Diffs the stored course against the payload about to replace it. Only renames
 * are reported: a level or topic with no counterpart id in the previous course
 * is a new one, and one that disappears was deleted - neither renames anything.
 */
export function planCourseRenames(previous: any, next: any): CourseRenamePlan {
  const plan: CourseRenamePlan = { course: null, tier: null, levels: [], topics: [] };

  const previousName = text(previous?.name);
  const nextName = text(next?.name);
  if (previousName && nextName && previousName !== nextName) plan.course = { from: previousName, to: nextName };

  const previousTier = text(previous?.level);
  const nextTier = text(next?.level);
  if (previousTier && nextTier && previousTier !== nextTier) plan.tier = { from: previousTier, to: nextTier };

  const previousLevels = new Map<string, any>();
  for (const level of previous?.levels || []) {
    const id = subdocumentId(level);
    if (id) previousLevels.set(id, level);
  }

  for (const level of next?.levels || []) {
    const previousLevel = previousLevels.get(subdocumentId(level));
    if (!previousLevel) continue;

    const levelFrom = text(previousLevel.name);
    const levelTo = text(level.name);
    if (levelFrom && levelTo && levelFrom !== levelTo) plan.levels.push({ from: levelFrom, to: levelTo });

    const previousTopics = new Map<string, any>();
    for (const topic of previousLevel.topics || []) {
      const id = subdocumentId(topic);
      if (id) previousTopics.set(id, topic);
    }
    for (const topic of level.topics || []) {
      const previousTopic = previousTopics.get(subdocumentId(topic));
      if (!previousTopic) continue;
      const topicFrom = text(previousTopic.name);
      const topicTo = text(topic.name);
      if (topicFrom && topicTo && topicFrom !== topicTo) plan.topics.push({ from: topicFrom, to: topicTo });
    }
  }

  return plan;
}

/**
 * Records which documents a rename actually changed. updateMany only reports a
 * count, and one classroom can be touched by a level rename and two topic
 * renames at once, so the ids are collected first and counted as a set.
 */
async function renameField(
  model: any,
  ids: any[],
  field: string,
  rename: Rename,
  touched: Set<string>,
  extraSet: Record<string, any> = {}
) {
  if (!ids.length) return;
  const match = { _id: { $in: ids }, [field]: rename.from };
  const affected = await model.find(match).select("_id").lean();
  if (!affected.length) return;
  await model.updateMany(match, { $set: { [field]: rename.to, ...extraSet } });
  for (const doc of affected) touched.add(String(doc._id));
}

/**
 * Renames a topic inside `sessionPlan` / `generatedSessions`, where the name is
 * repeated once per scheduled class.
 */
async function renameTopicInArray(ids: any[], arrayField: string, rename: Rename, touched: Set<string>) {
  if (!ids.length) return;
  const match = { _id: { $in: ids }, [`${arrayField}.topicName`]: rename.from };
  const affected = await Classroom.find(match).select("_id").lean();
  if (!affected.length) return;
  await Classroom.updateMany(
    match,
    { $set: { [`${arrayField}.$[entry].topicName`]: rename.to } },
    { arrayFilters: [{ "entry.topicName": rename.from }] }
  );
  for (const doc of affected) touched.add(String(doc._id));
}

/**
 * `previousCourseName` also picks up rows that carry the course name but never
 * got the course id - older classrooms and imported templates - so a rename
 * does not leave them stranded on a name nothing uses any more.
 */
function ownedByCourse(courseId: any, previousCourseName: string) {
  const clauses: any[] = [{ course: courseId }];
  if (previousCourseName) clauses.push({ course: null, courseName: previousCourseName });
  return { $or: clauses };
}

export async function applyCourseRenames(courseId: any, previousCourseName: string, plan: CourseRenamePlan): Promise<CourseRenameSummary> {
  const empty: CourseRenameSummary = { classrooms: 0, templates: 0, students: 0, plan };
  if (!hasRenames(plan)) return empty;

  const scope = ownedByCourse(courseId, previousCourseName);
  // The ids are resolved once, up front. Matching on the course name as each
  // update ran would miss rows the previous update had already renamed.
  const [classroomDocs, templateDocs] = await Promise.all([
    Classroom.find(scope).select("_id").lean(),
    AssignmentTemplate.find(scope).select("_id").lean(),
  ]);
  const classroomIds = classroomDocs.map((doc: any) => doc._id);
  const templateIds = templateDocs.map((doc: any) => doc._id);

  const touchedClassrooms = new Set<string>();
  const touchedTemplates = new Set<string>();

  if (plan.course) {
    await renameField(Classroom, classroomIds, "courseName", plan.course, touchedClassrooms);
    await renameField(AssignmentTemplate, templateIds, "courseName", plan.course, touchedTemplates);
  }

  for (const rename of plan.levels) {
    await renameField(Classroom, classroomIds, "levelName", rename, touchedClassrooms);
    await renameField(AssignmentTemplate, templateIds, "levelName", rename, touchedTemplates);
  }

  for (const rename of plan.topics) {
    await renameField(Classroom, classroomIds, "topicName", rename, touchedClassrooms);
    await renameTopicInArray(classroomIds, "sessionPlan", rename, touchedClassrooms);
    await renameTopicInArray(classroomIds, "generatedSessions", rename, touchedClassrooms);
    // The template's topicKey is what auto-assignment looks a session up by, so
    // it has to be rebuilt from the new name in the same write.
    await renameField(AssignmentTemplate, templateIds, "topicName", rename, touchedTemplates, {
      topicKey: normalizeTopicKey(rename.to),
    });
  }

  if (plan.tier) {
    // A classroom never stores "mixed" - the create route folds it to beginner.
    const classroomTierRename = { from: classroomTier(plan.tier.from), to: classroomTier(plan.tier.to) };
    if (classroomTierRename.from !== classroomTierRename.to) {
      await renameField(Classroom, classroomIds, "level", classroomTierRename, touchedClassrooms);
    }
    await renameField(AssignmentTemplate, templateIds, "level", plan.tier, touchedTemplates);
  }

  let students = 0;
  if (plan.course) {
    const result = await User.updateMany(
      { "conversionSetup.course": courseId, "conversionSetup.courseName": plan.course.from },
      { $set: { "conversionSetup.courseName": plan.course.to } }
    );
    students = Number(result?.modifiedCount || 0);
  }

  return {
    classrooms: touchedClassrooms.size,
    templates: touchedTemplates.size,
    students,
    plan,
  };
}
