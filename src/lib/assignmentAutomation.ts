import { AssignmentAutomationLog, AssignmentTemplate } from "@/models/AssignmentTemplate";
import { Classroom } from "@/models/Classroom";
import { Homework } from "@/models/Homework";
import { getSessionStart } from "@/lib/classroomSessions";
import { notifyHomeworkAssigned } from "@/lib/homeworkEmail";
import { notifyHomeworkNotAssigned } from "@/lib/homeworkAutomationAlerts";

export function normalizeTopicKey(value?: string | null) {
  return String(value || "")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/\bhw\b/gi, "")
    .replace(/\bhomework\b/gi, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function topicFromHomeworkFileName(value?: string | null) {
  return String(value || "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/\bhomework\b/gi, "")
    .replace(/\bhw\b/gi, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

function normalized(value: any) {
  return String(value || "").toLowerCase().trim();
}

function normalizedName(value: any) {
  return normalizeTopicKey(String(value || ""));
}

function levelNumber(value: any) {
  const match = normalizedName(value).match(/\blevel\s*(\d+)\b/);
  return match ? match[1] : "";
}

function sameLevelName(templateLevel: any, classroomLevel: any) {
  const templateName = normalizedName(templateLevel);
  const classroomName = normalizedName(classroomLevel);
  if (!templateName || !classroomName) return true;
  if (templateName === classroomName) return true;
  const templateNumber = levelNumber(templateName);
  const classroomNumber = levelNumber(classroomName);
  return Boolean(templateNumber && classroomNumber && templateNumber === classroomNumber);
}

function scheduledSessionsFor(classroom: any) {
  if (Array.isArray(classroom?.generatedSessions) && classroom.generatedSessions.length) return classroom.generatedSessions;
  if (!classroom?.classDate) return [];
  return [
    {
      _id: `${classroom._id}-single`,
      sessionNumber: 1,
      topicName: classroom.topicName || classroom.title,
      scheduledFor: classroom.classDate,
      startTime: classroom.startTime,
      durationMinutes: classroom.durationMinutes || 60,
      status: classroom.status || "scheduled",
    },
  ];
}

function findSession(classroom: any, scheduledSessionId: string) {
  return scheduledSessionsFor(classroom).find((session: any) => String(session?._id || "") === scheduledSessionId) || null;
}

// Session topics come from the course planner, template topics from PGN file
// names or a hand-typed name, so "&" against "and" or a stray "the" must not
// decide whether homework goes out.
function looseTopicKey(value?: string | null) {
  return normalizeTopicKey(String(value || "").replace(/&/g, " and "))
    .split(" ")
    .filter((word) => word && word !== "and" && word !== "the")
    .join(" ");
}

function placeLabel(value: any) {
  return `${value?.courseName || "no course"} - ${value?.levelName || "no level"}`;
}

/** Returns why a template cannot serve this classroom, or "" when it can. */
function incompatibility(template: any, classroom: any) {
  if (template.autoAssign === false) return "auto-assign is off";
  const templateCourse = objectId(template.course);
  const classroomCourse = objectId(classroom.course);
  const sameCourseId = Boolean(templateCourse && templateCourse === classroomCourse);
  const bothCourseNames = Boolean(template.courseName && classroom.courseName);
  const sameCourseName = bothCourseNames && normalizedName(template.courseName) === normalizedName(classroom.courseName);
  // The id is the truth and the names are frozen copies: a renamed course can
  // leave one side on the old name. Only when the ids differ (or one is
  // missing) does the name decide - a re-created course keeps its name.
  if (!sameCourseId) {
    if (templateCourse && classroomCourse && !sameCourseName) return "course";
    if (bothCourseNames && !sameCourseName) return "course";
  }
  if (template.levelName && classroom.levelName && !sameLevelName(template.levelName, classroom.levelName)) return "level";
  // The tier is only a fallback for templates that carry no course at all: a
  // classroom's tier defaults to beginner, so it is unreliable next to a course.
  const courseMatched = (templateCourse && templateCourse === classroomCourse) || sameCourseName;
  if (!courseMatched && template.level && template.level !== "mixed" && classroom.level && template.level !== classroom.level) return "level";
  return "";
}

function matchScore(template: any, classroom: any) {
  let score = 0;
  if (objectId(template.course) && objectId(template.course) === objectId(classroom.course)) score += 8;
  if (template.courseName && normalizedName(template.courseName) === normalizedName(classroom.courseName)) score += 4;
  if (template.levelName && normalizedName(template.levelName) === normalizedName(classroom.levelName)) score += 2;
  else if (template.levelName && sameLevelName(template.levelName, classroom.levelName)) score += 1;
  if (template.level && template.level === classroom.level) score += 1;
  if (template.linkStatus === "linked") score += 3;
  return score;
}

/** Returns true when this event is new for the session, false when it repeats an existing row. */
async function recordAutomationEvent(payload: Record<string, any>) {
  const result = await AssignmentAutomationLog.updateOne(
    {
      classroom: payload.classroom,
      scheduledSessionId: payload.scheduledSessionId,
      sourceTemplate: payload.sourceTemplate,
      status: payload.status,
    },
    { $set: payload },
    { upsert: true }
  );
  return Boolean(result.upsertedCount);
}

/**
 * Logs a completed class that ended without homework and emails the admin.
 * The email follows the log row's insert, so the second trigger for the same
 * class (register saved after the live room ended, possibly hours later)
 * does not send it again.
 */
async function recordMissedAssignment(classroom: any, payload: Record<string, any>) {
  const isNew = await recordAutomationEvent(payload);
  if (!isNew) return;
  void notifyHomeworkNotAssigned({
    classroom,
    classroomId: String(payload.classroom),
    scheduledSessionId: String(payload.scheduledSessionId),
    status: payload.status,
    reason: payload.message,
    topicName: payload.topicName,
  }).catch((error) => console.error("Homework automation alert email failed", error));
}

async function findTemplateForSession(classroom: any, topicName: string) {
  const topicKey = normalizeTopicKey(topicName);
  const rejected: Array<{ template: any; reason: string }> = [];
  if (!topicKey) return { topicKey, template: null, ambiguous: [] as any[], rejected };
  const looseKey = looseTopicKey(topicName);
  // A template left on "needs review" (a PGN import whose topic exists on more
  // than one course) is still a real template for this topic, so link status
  // only ranks candidates - it no longer hides them. Activities are loaded for
  // the winner alone; they carry whole PGNs.
  const candidates = (
    await AssignmentTemplate.find({ isActive: true })
      .select("_id title topicName topicKey course courseName level levelName linkStatus autoAssign")
      .lean()
  ).filter(
    (template: any) =>
      template.topicKey === topicKey || looseTopicKey(template.topicKey) === looseKey || looseTopicKey(template.topicName) === looseKey
  );
  const ranked: Array<{ template: any; score: number }> = [];
  for (const template of candidates) {
    const reason = incompatibility(template, classroom);
    if (reason) rejected.push({ template, reason });
    else ranked.push({ template, score: matchScore(template, classroom) });
  }
  ranked.sort((a, b) => b.score - a.score);
  if (!ranked.length) return { topicKey, template: null, ambiguous: [] as any[], rejected };
  const best = ranked[0].score;
  const top = ranked.filter((item) => item.score === best).map((item) => item.template);
  if (top.length > 1) return { topicKey, template: null, ambiguous: top, rejected };
  const template: any = await AssignmentTemplate.findById(top[0]._id).lean();
  return { topicKey, template, ambiguous: [] as any[], rejected };
}

function missingTemplateMessage(topicName: string, classroom: any, rejected: Array<{ template: any; reason: string }>) {
  if (!rejected.length) return `No auto-assignment template found for "${topicName}".`;
  const [first] = rejected;
  const detail =
    first.reason === "auto-assign is off"
      ? `"${first.template.title}" has auto-assign turned off`
      : `"${first.template.title}" is set to ${placeLabel(first.template)}, but this class is ${placeLabel(classroom)}`;
  const others = rejected.length > 1 ? ` (${rejected.length - 1} more template${rejected.length === 2 ? "" : "s"} for this topic also skipped)` : "";
  return `Template exists for "${topicName}" but was not used: ${detail}${others}.`;
}

function nextSessionStart(classroom: any, currentSession: any) {
  const currentStart = getSessionStart(currentSession);
  if (!currentStart) return null;
  return scheduledSessionsFor(classroom)
    .map((session: any) => ({ session, start: getSessionStart(session) }))
    .filter((item: any) => item.start && item.start > currentStart && String(item.session.status || "scheduled") !== "cancelled")
    .sort((a: any, b: any) => a.start.getTime() - b.start.getTime())[0]?.start || null;
}

function dueAtFor(template: any, classroom: any, currentSession: any, endedAt?: Date) {
  const policy = template.duePolicy || {};
  if (policy.type === "days_after_class") {
    const base = endedAt || getSessionStart(currentSession) || new Date();
    return new Date(base.getTime() + Math.max(1, Number(policy.daysAfterClass || 7)) * 86400000);
  }
  const nextStart = nextSessionStart(classroom, currentSession);
  if (!nextStart) return null;
  return new Date(nextStart.getTime() - Math.max(0, Number(policy.minutesBefore ?? 1)) * 60000);
}

function targetPayload(template: any, classroom: any) {
  const mode = template.targetMode || "classroom_batches";
  if (mode === "specific_batches") {
    return {
      assignedBatches: template.defaultBatches || [],
      assignedStudents: [],
      assignAllStudents: false,
      hasRecipients: Boolean((template.defaultBatches || []).length),
    };
  }
  if (mode === "specific_students") {
    return {
      assignedBatches: [],
      assignedStudents: template.defaultStudents || [],
      assignAllStudents: false,
      hasRecipients: Boolean((template.defaultStudents || []).length),
    };
  }
  if (mode === "all_class_students") {
    return {
      assignedBatches: [],
      assignedStudents: [],
      assignAllStudents: true,
      hasRecipients: Boolean((classroom.students || []).length),
    };
  }
  return {
    assignedBatches: classroom.batches || [],
    assignedStudents: [],
    assignAllStudents: false,
    hasRecipients: Boolean((classroom.batches || []).length),
  };
}

export async function autoAssignHomeworkForSession({
  classroomId,
  scheduledSessionId,
  actorId,
  endedAt,
}: {
  classroomId: string;
  scheduledSessionId: string;
  actorId?: string;
  endedAt?: Date;
}) {
  const classroom: any = await Classroom.findById(classroomId).lean();
  if (!classroom) return null;
  const currentSession = findSession(classroom, scheduledSessionId);
  if (!currentSession) return null;
  const topicName = String(currentSession.topicName || classroom.topicName || classroom.title || "").trim();
  const { topicKey, template, ambiguous, rejected } = await findTemplateForSession(classroom, topicName);

  if (ambiguous.length) {
    await recordMissedAssignment(classroom, {
      classroom: classroomId,
      scheduledSessionId,
      topicName,
      topicKey,
      status: "ambiguous_template",
      message: `Multiple auto-assignment templates match "${topicName}".`,
      metadata: { templateIds: ambiguous.map((item: any) => objectId(item._id)) },
    });
    return null;
  }

  if (!template) {
    await recordMissedAssignment(classroom, {
      classroom: classroomId,
      scheduledSessionId,
      topicName,
      topicKey,
      status: "missing_template",
      message: missingTemplateMessage(topicName, classroom, rejected),
      metadata: rejected.length
        ? {
            skippedTemplates: rejected.map(({ template: skipped, reason }) => ({
              id: objectId(skipped._id),
              title: skipped.title,
              reason,
              courseName: skipped.courseName || "",
              levelName: skipped.levelName || "",
            })),
          }
        : undefined,
    });
    return null;
  }

  // A completed class reaches here twice - once when the live room ends and
  // again when the register is saved. Whichever run came first already logged
  // "assigned", so the second one returns quietly instead of adding a row.
  const existingQuery = { classroom: classroomId, sourceSessionId: scheduledSessionId, sourceTemplate: template._id };
  const existing: any = await Homework.findOne(existingQuery).lean();
  if (existing) return existing;

  const target = targetPayload(template, classroom);
  if (!target.hasRecipients) {
    await recordMissedAssignment(classroom, {
      classroom: classroomId,
      scheduledSessionId,
      sourceTemplate: template._id,
      topicName,
      topicKey,
      status: "skipped_no_batch",
      message: `Template matched "${topicName}", but there are no batch recipients.`,
    });
    return null;
  }

  const dueAt = dueAtFor(template, classroom, currentSession, endedAt);
  if (!dueAt && template.duePolicy?.noNextClassBehavior === "skip") {
    await recordMissedAssignment(classroom, {
      classroom: classroomId,
      scheduledSessionId,
      sourceTemplate: template._id,
      topicName,
      topicKey,
      status: "skipped_no_next_class",
      message: `Template matched "${topicName}", but no next class was found for the deadline.`,
    });
    return null;
  }

  const instructor = objectId(classroom.coach) || objectId(classroom.instructor) || actorId;
  if (!instructor) {
    await recordMissedAssignment(classroom, {
      classroom: classroomId,
      scheduledSessionId,
      sourceTemplate: template._id,
      topicName,
      topicKey,
      status: "error",
      message: "Could not auto-assign homework because no instructor was available.",
    });
    return null;
  }

  let created: any;
  try {
    created = await Homework.create({
      classroom: classroomId,
      instructor,
      type: template.activities?.some((activity: any) => activity.type === "study_pgn")
        ? "pgn_study"
        : template.activities?.some((activity: any) => activity.type === "quiz" || activity.type === "written_answer")
          ? "quiz"
          : "puzzle_set",
      title: template.title,
      description: template.description,
      instructions: template.instructions,
      assignedStudents: target.assignedStudents,
      assignedBatches: target.assignedBatches,
      assignAllStudents: target.assignAllStudents,
      puzzles: JSON.parse(JSON.stringify(template.puzzles || [])),
      activities: JSON.parse(JSON.stringify(template.activities || [])),
      dueAt: dueAt || undefined,
      numberOfAttempts: template.numberOfAttempts || 1,
      timeLimitMinutes: template.timeLimitMinutes || 0,
      scoring: template.scoring || undefined,
      sourceTemplate: template._id,
      sourceSessionId: scheduledSessionId,
      autoAssigned: true,
      automationStatus: dueAt ? "assigned" : "assigned_without_due",
      isPublished: true,
    });
  } catch (error: any) {
    // Both triggers can pass the existence check together; the unique index
    // lets exactly one create win, and the loser hands back the winner's copy.
    if (error?.code !== 11000) throw error;
    return Homework.findOne(existingQuery).lean();
  }

  await recordAutomationEvent({
    classroom: classroomId,
    scheduledSessionId,
    sourceTemplate: template._id,
    homework: created._id,
    topicName,
    topicKey,
    status: dueAt ? "assigned" : "assigned_without_due",
    message: dueAt ? `Auto-assigned homework for "${topicName}".` : `Auto-assigned homework for "${topicName}" without a deadline because no next class was found.`,
    dueAt: dueAt || undefined,
  });

  await notifyHomeworkAssigned(created);

  return created;
}
