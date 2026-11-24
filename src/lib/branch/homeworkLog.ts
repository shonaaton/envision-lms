import "server-only";
import { Types } from "mongoose";
import { BranchHomeworkLog } from "@/models/Branch";
import { Homework } from "@/models/Homework";
import type { BranchKey } from "./scope";

const id = (value: unknown) => String((value as any)?._id ?? value ?? "");

export type HomeworkLogStatus = "shared" | "no_topic" | "no_login" | "no_template";

export type HomeworkLogEntry = {
  studentId: string;
  studentName: string;
  userId: string;
  topic: string;
  levelName: string;
  status: HomeworkLogStatus;
  reason: string;
  templateId?: string;
  templateTitle?: string;
};

/**
 * Writes what one auto-share run did, one line per taught student. A miss for
 * a student who already has homework on this register (set by hand before the
 * save) is written as fixed. Lines for students no longer taught on the
 * register are dropped unless they were shared or fixed.
 */
export async function writeHomeworkLog(branch: BranchKey, register: any, entries: HomeworkLogEntry[]) {
  const base = {
    branch,
    register: register._id,
    slot: register.slot,
    date: register.date,
    slotLabel: register.slotLabel || "",
    mode: register.mode,
  };
  const missedUsers = entries.filter((entry) => entry.status !== "shared" && entry.userId).map((entry) => entry.userId);
  const withHomework = new Map<string, string>();
  const homeworkByTemplate = new Map<string, string>();
  const homework: any[] = await Homework.find({ branchAttendance: register._id })
    .select("_id title sourceTemplate assignedStudents")
    .lean();
  for (const item of homework) {
    homeworkByTemplate.set(id(item.sourceTemplate), id(item));
    for (const user of item.assignedStudents || []) if (missedUsers.includes(id(user)) && !withHomework.has(id(user))) withHomework.set(id(user), String(item.title || ""));
  }

  const now = new Date();
  const ops = entries.map((entry) => {
    const set: Record<string, unknown> = {
      ...base,
      studentName: entry.studentName,
      topic: entry.topic,
      levelName: entry.levelName,
      status: entry.status,
      reason: entry.reason,
      template: entry.templateId ? new Types.ObjectId(entry.templateId) : null,
      templateTitle: entry.templateTitle || "",
      homework: entry.templateId && homeworkByTemplate.get(entry.templateId) ? new Types.ObjectId(homeworkByTemplate.get(entry.templateId)) : null,
    };
    const filter = { register: register._id, student: new Types.ObjectId(entry.studentId) };
    if (entry.status !== "shared" && withHomework.has(entry.userId)) {
      // Already has homework from this class (set by hand, or shared on an earlier save): covered.
      return {
        updateOne: {
          filter,
          update: [
            {
              $set: {
                // Literal values: typed text starting with "$" must not read as a field path.
                ...Object.fromEntries(Object.entries(set).map(([key, value]) => [key, { $literal: value }])),
                resolvedAt: { $ifNull: ["$resolvedAt", now] },
                resolvedByName: { $ifNull: ["$resolvedByName", "this class's register"] },
                resolvedTemplateTitle: { $ifNull: ["$resolvedTemplateTitle", withHomework.get(entry.userId) || ""] },
              },
            },
          ],
          upsert: true,
        },
      };
    }
    return { updateOne: { filter, update: { $set: set }, upsert: true } };
  });
  if (ops.length) await BranchHomeworkLog.bulkWrite(ops as any, { ordered: false });
  await BranchHomeworkLog.deleteMany({
    register: register._id,
    student: { $nin: entries.map((entry) => new Types.ObjectId(entry.studentId)) },
    status: { $ne: "shared" },
    resolvedAt: null,
  });
}

/** Marks a register's misses fixed once staff set homework for those students. */
export async function resolveHomeworkLog(registerId: unknown, studentIds: string[], byName: string, templateTitle: string) {
  if (!studentIds.length) return;
  await BranchHomeworkLog.updateMany(
    {
      register: registerId,
      student: { $in: studentIds.map((value) => new Types.ObjectId(value)) },
      status: { $ne: "shared" },
      resolvedAt: null,
    },
    { $set: { resolvedAt: new Date(), resolvedByName: byName || "Staff", resolvedTemplateTitle: templateTitle } }
  );
}
