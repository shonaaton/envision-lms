import "server-only";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { escapeRegex } from "@/lib/loginIdentity";
import { matchTemplateForTopic } from "@/lib/assignmentAutomation";
import { AssignmentTemplate } from "@/models/AssignmentTemplate";
import { Course } from "@/models/Course";
import { BranchHomeworkLog } from "@/models/Branch";
import type { BranchKey } from "./scope";
import { BranchError } from "./errors";
import { assignHomework } from "./attendance";
import { isDateKey } from "./rules";

/**
 * The Bowbazar Homework Templates page: the academy's own templates (the same
 * ones online uses, read-only here) and Bowbazar's auto-share log.
 */

const id = (value: unknown) => String((value as any)?._id ?? value ?? "");
const text = (value: unknown, max = 120) => String(value ?? "").trim().slice(0, max);
const isObjectId = (value: unknown) => typeof value === "string" && Types.ObjectId.isValid(value);

type Actor = { id: string; name?: string };

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

function activityLabel(activity: any) {
  const count = Array.isArray(activity?.items) ? activity.items.length : 0;
  const kind = activity?.source?.kind;
  const label =
    kind === "fen_mcq" ? "FEN + MCQ"
    : kind === "fen_written_answer" ? "FEN + Written"
    : activity?.type === "quiz" ? "MCQ"
    : activity?.type === "written_answer" ? "Written answer"
    : activity?.type === "study_pgn" ? "PGN homework"
    : activity?.type === "play_computer" ? "Play vs computer"
    : String(activity?.type || "activity").replaceAll("_", " ");
  return `${label}${count ? ` (${count})` : ""}`;
}

const sortedUnique = (values: unknown[]) =>
  Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));

const PAGE_SIZE = 25;

export async function listTemplates(input: { q?: string; course?: string; level?: string; auto?: string; page?: number }) {
  await dbConnect();
  const q = text(input.q);
  const course = text(input.course);
  const level = text(input.level);
  const page = Math.max(1, Math.floor(Number(input.page) || 1));
  const and: any[] = [{ isActive: { $ne: false } }];
  if (q) {
    const pattern = new RegExp(escapeRegex(q), "i");
    and.push({ $or: [{ title: pattern }, { topicName: pattern }, { courseName: pattern }, { levelName: pattern }] });
  }
  const courses: any[] = await Course.find({}, { name: 1, "levels.name": 1, "levels.topics.name": 1, "levels.topics.order": 1 }).sort({ name: 1 }).lean();
  if (course) {
    const ids = courses.filter((item) => String(item.name || "").trim() === course).map((item) => item._id);
    and.push({ $or: [{ courseName: course }, ...(ids.length ? [{ course: { $in: ids } }] : [])] });
  }
  if (level) and.push({ levelName: level });
  if (input.auto === "on") and.push({ autoAssign: { $ne: false } });
  if (input.auto === "off") and.push({ autoAssign: false });
  const filter = { $and: and };

  const [templates, total, active, autoOn, courseNames, levelNames] = await Promise.all([
    AssignmentTemplate.find(filter)
      .select("title topicName courseName course levelName level autoAssign linkStatus activities.type activities.items activities.source.kind updatedAt")
      .populate("course", "name")
      .sort({ courseName: 1, levelName: 1, topicName: 1, _id: 1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    AssignmentTemplate.countDocuments(filter),
    AssignmentTemplate.countDocuments({ isActive: { $ne: false } }),
    AssignmentTemplate.countDocuments({ isActive: { $ne: false }, autoAssign: { $ne: false } }),
    AssignmentTemplate.distinct("courseName", { isActive: { $ne: false } }),
    AssignmentTemplate.distinct("levelName", { isActive: { $ne: false }, ...(course ? { courseName: course } : {}) }),
  ]);

  return {
    rows: (templates as any[]).map((template) => {
      const activities = (template.activities || []) as any[];
      return {
        id: id(template),
        title: String(template.title || "Untitled"),
        topicName: String(template.topicName || ""),
        courseName: String(template.course?.name || template.courseName || ""),
        levelName: String(template.levelName || ""),
        autoAssign: template.autoAssign !== false,
        linked: template.linkStatus === "linked",
        activities: activities.length ? activities.map(activityLabel).join(", ") : "No activities",
      };
    }),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    counts: { active, autoOn, autoOff: active - autoOn },
    courseOptions: sortedUnique([...courses.map((item) => item.name), ...courseNames]),
    levelOptions: sortedUnique([
      ...courses.filter((item) => !course || String(item.name || "").trim() === course).flatMap((item) => (item.levels || []).map((entry: any) => entry?.name)),
      ...levelNames,
    ]),
    // For "Check a topic": every course level with its topics in syllabus order.
    courses: courses.map((item) => ({
      id: id(item),
      name: String(item.name || "Untitled course"),
      levels: ((item.levels || []) as any[]).map((entry) => ({
        name: String(entry?.name || ""),
        topics: [...(entry?.topics || [])]
          .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
          .map((topic: any) => String(topic?.name || ""))
          .filter(Boolean),
      })).filter((entry) => entry.name),
    })),
  };
}

/** What auto-share would send a student of this course level taught this topic. */
export async function checkTopic(input: { courseId?: string; levelName?: string; topic?: string }) {
  await dbConnect();
  const topic = text(input.topic, 200);
  if (!topic) throw new BranchError("Type the topic taught.");
  const course: any = isObjectId(input.courseId) ? await Course.findById(input.courseId).select("name").lean() : null;
  const place = { course: course?._id, courseName: course?.name || "", levelName: text(input.levelName) };
  const { template, reason } = await matchTemplateForTopic(place, topic);
  return {
    template: template ? { id: id(template), title: String(template.title || ""), activities: ((template.activities || []) as any[]).map(activityLabel).join(", ") } : null,
    reason,
  };
}

// ---------------------------------------------------------------------------
// Auto-share log
// ---------------------------------------------------------------------------

export const LOG_GROUPS = ["all", "open", "shared", "fixed", "no_template", "no_topic", "no_login"] as const;
export type LogGroup = (typeof LOG_GROUPS)[number];

export type LogFilters = { group: LogGroup; mode: "" | "online" | "offline"; q: string; from: string; to: string; cleared: boolean };

export function parseLogFilters(params: URLSearchParams): LogFilters {
  const get = (key: string) => text(params.get(key));
  const group = get("group") as LogGroup;
  const mode = get("mode");
  return {
    group: LOG_GROUPS.includes(group) ? group : "all",
    mode: mode === "online" || mode === "offline" ? mode : "",
    q: get("q"),
    from: isDateKey(get("from")) ? get("from") : "",
    to: isDateKey(get("to")) ? get("to") : "",
    cleared: get("cleared") === "1",
  };
}

function groupMatch(group: LogGroup): Record<string, any> {
  switch (group) {
    case "open":
      return { status: { $ne: "shared" }, resolvedAt: null };
    case "shared":
      return { status: "shared" };
    case "fixed":
      return { status: { $ne: "shared" }, resolvedAt: { $ne: null } };
    case "no_template":
    case "no_topic":
    case "no_login":
      return { status: group };
    default:
      return {};
  }
}

function baseMatch(branch: BranchKey, filters: LogFilters) {
  const match: Record<string, any> = { branch, clearedAt: filters.cleared ? { $ne: null } : null };
  if (filters.mode) match.mode = filters.mode;
  if (filters.from || filters.to) match.date = { ...(filters.from ? { $gte: filters.from } : {}), ...(filters.to ? { $lte: filters.to } : {}) };
  if (filters.q) {
    const pattern = new RegExp(escapeRegex(filters.q), "i");
    match.$or = [{ studentName: pattern }, { topic: pattern }, { templateTitle: pattern }, { slotLabel: pattern }, { reason: pattern }];
  }
  return match;
}

function serializeLog(row: any) {
  return {
    id: id(row),
    date: String(row.date || ""),
    slotId: id(row.slot),
    slotLabel: String(row.slotLabel || ""),
    mode: String(row.mode || "offline"),
    studentId: id(row.student),
    studentName: String(row.studentName || "Student"),
    topic: String(row.topic || ""),
    levelName: String(row.levelName || ""),
    status: String(row.status),
    reason: String(row.reason || ""),
    templateTitle: String(row.templateTitle || ""),
    resolved: row.resolvedAt ? { at: new Date(row.resolvedAt).toISOString(), by: String(row.resolvedByName || ""), title: String(row.resolvedTemplateTitle || "") } : null,
    cleared: row.clearedAt ? { at: new Date(row.clearedAt).toISOString(), by: String(row.clearedByName || "") } : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : "",
  };
}

export type HomeworkLogRow = ReturnType<typeof serializeLog>;

export async function listHomeworkLog(branch: BranchKey, filters: LogFilters, page = 1, limit = 50) {
  await dbConnect();
  const base = baseMatch(branch, filters);
  const match = { ...base, ...groupMatch(filters.group) };
  const skip = (Math.max(1, page) - 1) * limit;
  const [rows, total, ...counts] = await Promise.all([
    BranchHomeworkLog.find(match).sort({ date: -1, slotLabel: 1, studentName: 1, _id: 1 }).skip(skip).limit(limit + 1).lean(),
    BranchHomeworkLog.countDocuments(match),
    ...LOG_GROUPS.map((group) => BranchHomeworkLog.countDocuments({ ...base, ...groupMatch(group) })),
  ]);
  return {
    rows: (rows as any[]).slice(0, limit).map(serializeLog),
    hasMore: rows.length > limit,
    total,
    counts: Object.fromEntries(LOG_GROUPS.map((group, index) => [group, counts[index]])) as Record<LogGroup, number>,
  };
}

const STATUS_TEXT: Record<string, string> = {
  shared: "Shared automatically",
  no_template: "No template",
  no_topic: "No topic written",
  no_login: "No login",
};

export async function homeworkLogCsv(branch: BranchKey, filters: LogFilters) {
  const { rows } = await listHomeworkLog(branch, filters, 1, 5000);
  const cell = (value: string) => (/[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);
  const lines = [["Class date", "Class", "Mode", "Student", "Level", "Topic", "Result", "Homework", "Reason", "Fixed by", "Fixed with"]];
  for (const row of rows) {
    lines.push([
      row.date,
      row.slotLabel,
      row.mode === "online" ? "Online" : "Centre",
      row.studentName,
      row.levelName,
      row.topic,
      row.status !== "shared" && row.resolved ? "Fixed by hand" : STATUS_TEXT[row.status] || row.status,
      row.templateTitle,
      row.reason,
      row.resolved?.by || "",
      row.resolved?.title || "",
    ]);
  }
  return lines.map((line) => line.map((value) => cell(String(value ?? ""))).join(",")).join("\n");
}

/** Hides log lines (or brings them back). Nothing is deleted. */
export async function clearHomeworkLog(branch: BranchKey, ids: unknown, restore: boolean, actor: Actor) {
  await dbConnect();
  const list = (Array.isArray(ids) ? ids : []).filter(isObjectId).slice(0, 500);
  if (!list.length) throw new BranchError("Pick the lines to clear.");
  const result = await BranchHomeworkLog.updateMany(
    { _id: { $in: list }, branch },
    restore ? { $set: { clearedAt: null, clearedByName: "" } } : { $set: { clearedAt: new Date(), clearedByName: actor.name || "Staff" } }
  );
  return { changed: result.modifiedCount };
}

/** Sets homework for the student on a missed log line, through the register's own path. */
export async function assignFromLog(branch: BranchKey, logId: string, input: any, actor: Actor) {
  await dbConnect();
  if (!isObjectId(logId)) throw new BranchError("Log line not found.", 404);
  const row: any = await BranchHomeworkLog.findOne({ _id: logId, branch }).lean();
  if (!row) throw new BranchError("Log line not found.", 404);
  await assignHomework(branch, id(row.slot), row.date, { templateId: input?.templateId, studentIds: [id(row.student)], dueDate: input?.dueDate }, actor);
  const updated: any = await BranchHomeworkLog.findById(row._id).lean();
  if (updated && !updated.resolvedAt && updated.status !== "shared") {
    throw new BranchError("This student has no login yet, so homework can't reach them. Send their login first.");
  }
  return serializeLog(updated);
}
