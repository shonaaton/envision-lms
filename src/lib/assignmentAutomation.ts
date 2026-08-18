import { AssignmentAutomationLog, AssignmentTemplate } from "@/models/AssignmentTemplate";
import { Classroom } from "@/models/Classroom";
import { Homework } from "@/models/Homework";
import { getSessionStart } from "@/lib/classroomSessions";
import { notifyHomeworkAssigned } from "@/lib/homeworkEmail";

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

function compatible(template: any, classroom: any) {
  const templateCourse = objectId(template.course);
  const classroomCourse = objectId(classroom.course);
  if (templateCourse && classroomCourse && templateCourse !== classroomCourse) return false;
  if (template.courseName && classroom.courseName && normalizedName(template.courseName) !== normalizedName(classroom.courseName)) return false;
  if (template.levelName && classroom.levelName && !sameLevelName(template.levelName, classroom.levelName)) return false;
  if (template.level && template.level !== "mixed" && classroom.level && template.level !== classroom.level) return false;
  return true;
}

function matchScore(template: any, classroom: any) {
  let score = 0;
  if (objectId(template.course) && objectId(template.course) === objectId(classroom.course)) score += 8;
  if (template.courseName && normalizedName(template.courseName) === normalizedName(classroom.courseName)) score += 4;
  if (template.levelName && normalizedName(template.levelName) === normalizedName(classroom.levelName)) score += 2;
  else if (template.levelName && sameLevelName(template.levelName, classroom.levelName)) score += 1;
  if (template.level && template.level === classroom.level) score += 1;
  return score;
}

async function recordAutomationEvent(payload: Record<string, any>) {
  await AssignmentAutomationLog.findOneAndUpdate(
    {
      classroom: payload.classroom,
      scheduledSessionId: payload.scheduledSessionId,
      sourceTemplate: payload.sourceTemplate,
      status: payload.status,
    },
    { $set: payload },
    { upsert: true, new: true }
  );
}

async function findTemplateForSession(classroom: any, topicName: string) {
  const topicKey = normalizeTopicKey(topicName);
  if (!topicKey) return { topicKey, template: null, ambiguous: [] as any[] };
  const candidates = await AssignmentTemplate.find({
    topicKey,
    isActive: true,
    autoAssign: true,
    linkStatus: "linked",
  }).lean();
  const ranked = candidates
    .filter((template: any) => compatible(template, classroom))
    .map((template: any) => ({ template, score: matchScore(template, classroom) }))
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return { topicKey, template: null, ambiguous: [] as any[] };
  const best = ranked[0].score;
  const top = ranked.filter((item) => item.score === best).map((item) => item.template);
  if (top.length > 1) return { topicKey, template: null, ambiguous: top };
  return { topicKey, template: top[0], ambiguous: [] as any[] };
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
  const { topicKey, template, ambiguous } = await findTemplateForSession(classroom, topicName);

  if (ambiguous.length) {
    await recordAutomationEvent({
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
    await recordAutomationEvent({
      classroom: classroomId,
      scheduledSessionId,
      topicName,
      topicKey,
      status: "missing_template",
      message: `No linked auto-assignment template found for "${topicName}".`,
    });
    return null;
  }

  const existing: any = await Homework.findOne({ classroom: classroomId, sourceSessionId: scheduledSessionId, sourceTemplate: template._id }).lean();
  if (existing) {
    await recordAutomationEvent({
      classroom: classroomId,
      scheduledSessionId,
      sourceTemplate: template._id,
      homework: existing._id,
      topicName,
      topicKey,
      status: "already_assigned",
      message: `Homework already exists for "${topicName}".`,
      dueAt: existing.dueAt,
    });
    return existing;
  }

  const target = targetPayload(template, classroom);
  if (!target.hasRecipients) {
    await recordAutomationEvent({
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
    await recordAutomationEvent({
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
    await recordAutomationEvent({
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

  const created = await Homework.create({
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
