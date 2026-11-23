import { Types } from "mongoose";
import { AssignmentAutomationLog, AssignmentTemplate } from "@/models/AssignmentTemplate";
import { Classroom } from "@/models/Classroom";
import { Homework } from "@/models/Homework";
import { getSessionStart } from "@/lib/classroomSessions";
import { looseTopicKey, normalizeTopicKey, scheduledSessionsFor } from "@/lib/assignmentAutomation";
import { notifyHomeworkAssigned } from "@/lib/homeworkEmail";
import { recordActivity } from "@/lib/activity";
import "@/models/Batch";
import "@/models/User";

/**
 * The events panel on /admin/homework-templates: filtering, export, clearing,
 * and assigning homework for a class the automation skipped.
 */

export const ACTIONABLE_STATUSES = ["missing_template", "ambiguous_template", "skipped_no_batch", "skipped_no_next_class", "error"] as const;

export const EVENT_GROUPS = ["open", "all", "missing", "skipped", "error", "assigned", "resolved"] as const;
export type EventGroup = (typeof EVENT_GROUPS)[number];

export type EventFilters = {
  group: EventGroup;
  q: string;
  from: string;
  to: string;
  cleared: boolean;
};

export function parseEventFilters(params: URLSearchParams | Record<string, any>): EventFilters {
  const get = (key: string) => String((params instanceof URLSearchParams ? params.get(key) : params?.[key]) ?? "").trim();
  const group = get("group") as EventGroup;
  return {
    group: EVENT_GROUPS.includes(group) ? group : "all",
    q: get("q").slice(0, 120),
    from: /^\d{4}-\d{2}-\d{2}$/.test(get("from")) ? get("from") : "",
    to: /^\d{4}-\d{2}-\d{2}$/.test(get("to")) ? get("to") : "",
    cleared: get("cleared") === "1" || get("cleared") === "true",
  };
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Date inputs are academy (IST) calendar days.
function istDayStart(day: string) {
  return new Date(`${day}T00:00:00+05:30`);
}

export function groupFilter(group: EventGroup): Record<string, any> {
  switch (group) {
    case "open":
      return { status: { $in: [...ACTIONABLE_STATUSES] }, resolvedAt: null };
    case "missing":
      return { status: { $in: ["missing_template", "ambiguous_template"] } };
    case "skipped":
      return { status: { $in: ["skipped_no_batch", "skipped_no_next_class"] } };
    case "error":
      return { status: "error" };
    case "assigned":
      return { status: { $in: ["assigned", "assigned_without_due"] } };
    case "resolved":
      return { resolvedAt: { $ne: null } };
    default:
      return {};
  }
}

/** Everything except the status group, so the group chips can show their own counts. */
export async function baseEventFilter(filters: EventFilters) {
  // "already assigned" rows were the second trigger of the same class echoing
  // an "assigned" row, so they never appear in the feed.
  const and: any[] = [{ status: { $ne: "already_assigned" } }];
  and.push(filters.cleared ? { clearedAt: { $ne: null } } : { clearedAt: null });
  // Bowbazar's online classes are its own; their events never show in the online feed.
  const branchRooms: any[] = await Classroom.find({ branch: { $ne: null } }).select("_id").lean();
  if (branchRooms.length) and.push({ classroom: { $nin: branchRooms.map((room) => room._id) } });
  if (filters.from || filters.to) {
    const createdAt: Record<string, Date> = {};
    if (filters.from) createdAt.$gte = istDayStart(filters.from);
    if (filters.to) createdAt.$lt = new Date(istDayStart(filters.to).getTime() + 86400000);
    and.push({ createdAt });
  }
  if (filters.q) {
    const regex = new RegExp(escapeRegex(filters.q), "i");
    const classrooms = await Classroom.find({ title: regex }).select("_id").limit(500).lean();
    const or: any[] = [{ topicName: regex }, { message: regex }];
    if (classrooms.length) or.push({ classroom: { $in: classrooms.map((item: any) => item._id) } });
    and.push({ $or: or });
  }
  return { $and: and };
}

export async function eventFilter(filters: EventFilters) {
  const base = await baseEventFilter(filters);
  const group = groupFilter(filters.group);
  return Object.keys(group).length ? { $and: [...base.$and, group] } : base;
}

export async function eventGroupCounts(filters: EventFilters) {
  const base = await baseEventFilter(filters);
  const counts = await Promise.all(
    EVENT_GROUPS.map((group) => {
      const extra = groupFilter(group);
      return AssignmentAutomationLog.countDocuments(Object.keys(extra).length ? { $and: [...base.$and, extra] } : base);
    })
  );
  return Object.fromEntries(EVENT_GROUPS.map((group, index) => [group, counts[index]])) as Record<EventGroup, number>;
}

export function populateEvents(query: any) {
  return query
    .populate("classroom", "title")
    .populate("sourceTemplate", "title")
    .populate("homework", "title")
    .populate("resolvedHomework", "title dueAt")
    .populate("resolvedTemplate", "title")
    .populate("resolvedBy", "name")
    .populate("clearedBy", "name");
}

export type AutomationEventRow = {
  id: string;
  status: string;
  createdAt: string;
  topicName: string;
  message: string;
  classroomId: string;
  classroomTitle: string;
  templateTitle: string;
  homeworkTitle: string;
  actionable: boolean;
  resolved: null | { at: string; by: string; homeworkTitle: string; templateTitle: string; dueAt: string };
  cleared: null | { at: string; by: string };
};

function iso(value: any) {
  return value ? new Date(value).toISOString() : "";
}

export function serializeEvent(log: any): AutomationEventRow {
  const status = String(log.status || "");
  return {
    id: String(log._id),
    status,
    createdAt: iso(log.createdAt),
    topicName: String(log.topicName || ""),
    message: String(log.message || ""),
    classroomId: log.classroom?._id ? String(log.classroom._id) : log.classroom ? String(log.classroom) : "",
    classroomTitle: String(log.classroom?.title || ""),
    templateTitle: String(log.sourceTemplate?.title || ""),
    homeworkTitle: String(log.homework?.title || ""),
    actionable: (ACTIONABLE_STATUSES as readonly string[]).includes(status) && Boolean(log.classroom) && Boolean(log.scheduledSessionId),
    resolved: log.resolvedAt
      ? {
          at: iso(log.resolvedAt),
          by: String(log.resolvedBy?.name || ""),
          homeworkTitle: String(log.resolvedHomework?.title || ""),
          templateTitle: String(log.resolvedTemplate?.title || ""),
          dueAt: iso(log.resolvedHomework?.dueAt),
        }
      : null,
    cleared: log.clearedAt ? { at: iso(log.clearedAt), by: String(log.clearedBy?.name || "") } : null,
  };
}

/** IST text by hand: prod ICU prints midnight as hour "24", so no Intl here. */
export function istText(value?: string | Date | null) {
  if (!value) return "";
  const date = new Date(new Date(value).getTime() + 330 * 60000);
  return date.toISOString().slice(0, 16).replace("T", " ");
}

export const STATUS_LABELS: Record<string, string> = {
  assigned: "Assigned",
  assigned_without_due: "Assigned (no deadline)",
  missing_template: "Missing template",
  ambiguous_template: "Several templates match",
  skipped_no_batch: "Skipped - no batch",
  skipped_no_next_class: "Skipped - no next class",
  error: "Error",
};

/* ----------------------------------------------------- assign from event */

export class EventActionError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function sessionFor(classroom: any, scheduledSessionId: string) {
  return scheduledSessionsFor(classroom).find((session: any) => String(session?._id || "") === scheduledSessionId) || null;
}

/** One minute before the class's next upcoming session, else a week from now. */
function suggestedDueAt(classroom: any) {
  const now = Date.now();
  const next = scheduledSessionsFor(classroom)
    .filter((session: any) => String(session?.status || "scheduled") !== "cancelled")
    .map((session: any) => getSessionStart(session))
    .filter((start: Date | null): start is Date => Boolean(start) && (start as Date).getTime() > now + 2 * 3600000)
    .sort((a: Date, b: Date) => a.getTime() - b.getTime())[0];
  return next ? new Date(next.getTime() - 60000) : new Date(now + 7 * 86400000);
}

type TemplateOption = {
  id: string;
  title: string;
  topicName: string;
  courseName: string;
  levelName: string;
  reason: string;
  autoAssign: boolean;
};

function templateOption(template: any, reason: string): TemplateOption {
  return {
    id: String(template._id),
    title: String(template.title || "Untitled template"),
    topicName: String(template.topicName || ""),
    courseName: String(template.course?.name || template.courseName || ""),
    levelName: String(template.levelName || template.level || ""),
    reason,
    autoAssign: template.autoAssign !== false,
  };
}

export async function loadEventAssignContext(eventId: string, q = "") {
  if (!Types.ObjectId.isValid(eventId)) throw new EventActionError("Event not found", 404);
  const log: any = await AssignmentAutomationLog.findById(eventId).lean();
  if (!log) throw new EventActionError("Event not found", 404);
  const classroom: any = log.classroom
    ? await Classroom.findById(log.classroom)
        .select("title levelName level courseName batches students generatedSessions classDate startTime durationMinutes status topicName")
        .populate("batches", "name students")
        .lean()
    : null;
  if (!classroom) throw new EventActionError("The class for this event no longer exists.", 404);

  const session = sessionFor(classroom, String(log.scheduledSessionId || ""));
  const topicName = String(log.topicName || session?.topicName || classroom.topicName || "");
  const fields = "_id title topicName topicKey course courseName level levelName autoAssign linkStatus";
  const all: any[] = await AssignmentTemplate.find({ isActive: { $ne: false } }).select(fields).populate("course", "name").lean();

  const picked = new Map<string, TemplateOption>();
  const add = (template: any, reason: string) => {
    if (template && !picked.has(String(template._id))) picked.set(String(template._id), templateOption(template, reason));
  };

  const byId = new Map(all.map((template) => [String(template._id), template]));
  for (const id of log.metadata?.templateIds || []) add(byId.get(String(id)), "Matches this topic");
  for (const skipped of log.metadata?.skippedTemplates || []) add(byId.get(String(skipped.id)), `Skipped by automation: ${skipped.reason}`);
  if (log.sourceTemplate) add(byId.get(String(log.sourceTemplate)), "Matched by automation");

  const key = normalizeTopicKey(topicName);
  const loose = looseTopicKey(topicName);
  if (key) {
    for (const template of all) {
      if (template.topicKey === key || looseTopicKey(template.topicKey) === loose || looseTopicKey(template.topicName) === loose) add(template, "Same topic");
    }
    // Partial match on the topic's longer words, for topics typed slightly differently.
    const words = loose.split(" ").filter((word) => word.length > 3);
    if (words.length) {
      for (const template of all) {
        const haystack = looseTopicKey(`${template.topicName} ${template.title}`);
        if (words.filter((word) => haystack.includes(word)).length >= Math.min(2, words.length)) add(template, "Similar topic");
      }
    }
  }

  const suggestions = Array.from(picked.values()).slice(0, 12);
  let results: TemplateOption[] = [];
  if (q.trim()) {
    const regex = new RegExp(escapeRegex(q.trim()), "i");
    results = all
      .filter((template) => [template.title, template.topicName, template.courseName, template.course?.name, template.levelName].some((value) => regex.test(String(value || ""))))
      .slice(0, 25)
      .map((template) => templateOption(template, ""));
  }

  const batches = (classroom.batches || []).map((batch: any) => ({ id: String(batch._id), name: String(batch.name || "Batch"), students: (batch.students || []).length }));
  const existing: any[] = log.scheduledSessionId
    ? await Homework.find({ classroom: classroom._id, sourceSessionId: String(log.scheduledSessionId) }).select("title dueAt").lean()
    : [];

  return {
    event: {
      id: String(log._id),
      status: String(log.status),
      topicName,
      message: String(log.message || ""),
      resolvedAt: iso(log.resolvedAt),
    },
    classroom: {
      id: String(classroom._id),
      title: String(classroom.title || "Class"),
      levelName: String(classroom.levelName || classroom.level || ""),
      sessionStart: iso(session ? getSessionStart(session) : null),
      batches,
      studentCount: (classroom.students || []).length,
    },
    recipients: batches.length
      ? `${batches.map((batch: any) => batch.name).join(", ")} (${batches.reduce((sum: number, batch: any) => sum + batch.students, 0)} students)`
      : (classroom.students || []).length
        ? `All ${(classroom.students || []).length} students in the class`
        : "",
    suggestedDueAt: suggestedDueAt(classroom).toISOString(),
    existingHomework: existing.map((item) => ({ id: String(item._id), title: String(item.title || ""), dueAt: iso(item.dueAt) })),
    suggestions,
    results,
  };
}

function assignmentType(template: any) {
  if (template.activities?.some((activity: any) => activity.type === "study_pgn")) return "pgn_study";
  if (template.activities?.some((activity: any) => activity.type === "quiz" || activity.type === "written_answer")) return "quiz";
  return "puzzle_set";
}

export async function assignFromEvent({ eventId, templateId, dueAt, actorId }: { eventId: string; templateId: string; dueAt: Date; actorId: string }) {
  if (!Types.ObjectId.isValid(eventId)) throw new EventActionError("Event not found", 404);
  if (!Types.ObjectId.isValid(templateId)) throw new EventActionError("Choose a template");
  if (!(dueAt instanceof Date) || Number.isNaN(dueAt.getTime()) || dueAt.getTime() <= Date.now()) {
    throw new EventActionError("Choose a submission deadline in the future.");
  }

  const log: any = await AssignmentAutomationLog.findById(eventId).lean();
  if (!log) throw new EventActionError("Event not found", 404);
  if (!(ACTIONABLE_STATUSES as readonly string[]).includes(String(log.status))) throw new EventActionError("This event already has homework assigned.");
  if (log.resolvedAt) throw new EventActionError("Homework was already assigned for this event.");
  const scheduledSessionId = String(log.scheduledSessionId || "");
  if (!log.classroom || !scheduledSessionId) throw new EventActionError("This event is not tied to a class session.");

  const [classroom, template]: any[] = await Promise.all([
    Classroom.findById(log.classroom).select("title coach instructor batches students").lean(),
    AssignmentTemplate.findOne({ _id: templateId, isActive: { $ne: false } }).lean(),
  ]);
  if (!classroom) throw new EventActionError("The class for this event no longer exists.", 404);
  if (!template) throw new EventActionError("That template is no longer active.", 404);

  const duplicate = await Homework.findOne({ classroom: classroom._id, sourceSessionId: scheduledSessionId, sourceTemplate: template._id }).select("_id").lean();
  if (duplicate) throw new EventActionError(`"${template.title}" is already assigned for this class.`);

  // Same recipients the automation would have used: the class's batches, or
  // every student in the class when it has no batch.
  const batches = classroom.batches || [];
  const students = classroom.students || [];
  if (!batches.length && !students.length) throw new EventActionError("This class has no batch or students to assign to.");

  const topicName = String(log.topicName || "");
  const created: any = await Homework.create({
    classroom: classroom._id,
    instructor: classroom.coach || classroom.instructor || actorId,
    type: assignmentType(template),
    title: template.title,
    description: template.description,
    instructions: template.instructions,
    assignedStudents: [],
    assignedBatches: batches,
    assignAllStudents: !batches.length,
    puzzles: JSON.parse(JSON.stringify(template.puzzles || [])),
    activities: JSON.parse(JSON.stringify(template.activities || [])),
    dueAt,
    numberOfAttempts: template.numberOfAttempts || 1,
    timeLimitMinutes: template.timeLimitMinutes || 0,
    scoring: template.scoring || undefined,
    sourceTemplate: template._id,
    sourceSessionId: scheduledSessionId,
    autoAssigned: false,
    automationStatus: "manually_assigned",
    isPublished: true,
  });

  // Every open event for the same class session is answered by this homework
  // (a session can log both "ambiguous" and "missing" on different triggers).
  const resolution = { resolvedAt: new Date(), resolvedBy: actorId, resolvedHomework: created._id, resolvedTemplate: template._id };
  await AssignmentAutomationLog.updateMany(
    { classroom: classroom._id, scheduledSessionId, status: { $in: [...ACTIONABLE_STATUSES] }, resolvedAt: null },
    { $set: resolution }
  );

  await recordActivity({
    actor: actorId,
    type: "homework.assigned_from_automation_event",
    label: `Assigned ${template.title} for missed homework on ${classroom.title || "a class"}`,
    entityType: "Homework",
    entityId: String(created._id),
    metadata: { eventId, templateId, classroomId: String(classroom._id), scheduledSessionId, topicName, dueAt: dueAt.toISOString() },
  } as any);

  await notifyHomeworkAssigned(created);

  return { homeworkId: String(created._id), title: String(template.title), dueAt: dueAt.toISOString() };
}
