import "server-only";
import { Types } from "mongoose";
import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { academyDateTime } from "@/lib/academyTime";
import { recordActivity } from "@/lib/activity";
import { notifyHomeworkAssigned } from "@/lib/homeworkEmail";
import { cancelHomeworkDeadlineReminders } from "@/lib/homeworkEmailReminders";
import { homeworkSchema } from "@/lib/validation";
import { AssignmentTemplate } from "@/models/AssignmentTemplate";
import { Homework, Submission } from "@/models/Homework";
import { BranchAttendance, BranchSlot, BranchStudent } from "@/models/Branch";
import type { BranchKey } from "./scope";
import { BranchError } from "./errors";
import { homeworkType } from "./attendance";
import { isDateKey, slotLabel, todayKey } from "./rules";

/**
 * Bowbazar homework set outside a register: a template or a home-made
 * assignment, given to whole classes (centre or online) or chosen students.
 * Like register homework it carries `branch` and named students, and no
 * classroom, so the online lists never show it.
 */

const id = (value: unknown) => String((value as any)?._id ?? value ?? "");
const isObjectId = (value: unknown) => typeof value === "string" && Types.ObjectId.isValid(value);

type Actor = { id: string; name?: string };
type Targets = { slotIds?: unknown; studentIds?: unknown };

/** The classes and students homework can go to. */
export async function homeworkTargets(branch: BranchKey) {
  await dbConnect();
  const [slots, students]: [any[], any[]] = await Promise.all([
    BranchSlot.find({ branch, isActive: true }).select("name dayOfWeek startTime endTime mode").sort({ dayOfWeek: 1, startTime: 1 }).lean(),
    BranchStudent.find({ branch, status: "active" }).select("name regNo user slots courseLevelName").sort({ name: 1 }).lean(),
  ]);
  return {
    slots: slots.map((slot) => {
      const members = students.filter((student) => (student.slots || []).some((value: any) => id(value) === id(slot)));
      return {
        id: id(slot),
        label: slotLabel(slot),
        mode: String(slot.mode || "offline"),
        students: members.length,
        withLogin: members.filter((student) => student.user).length,
      };
    }),
    students: students.map((student) => ({
      id: id(student),
      name: String(student.name || "Student"),
      regNo: String(student.regNo || ""),
      levelName: String(student.courseLevelName || ""),
      hasLogin: Boolean(student.user),
      slotIds: (student.slots || []).map(id),
    })),
  };
}

/** The logins of every active student in the picked classes plus the picked students. */
async function resolveTargets(branch: BranchKey, input: Targets) {
  const slotIds = (Array.isArray(input.slotIds) ? input.slotIds : []).filter(isObjectId) as string[];
  const studentIds = (Array.isArray(input.studentIds) ? input.studentIds : []).filter(isObjectId) as string[];
  if (!slotIds.length && !studentIds.length) throw new BranchError("Pick a class or at least one student.");
  const students: any[] = await BranchStudent.find({
    branch,
    status: "active",
    $or: [...(slotIds.length ? [{ slots: { $in: slotIds } }] : []), ...(studentIds.length ? [{ _id: { $in: studentIds } }] : [])],
  })
    .select("name user")
    .lean();
  const withLogin = students.filter((student) => student.user);
  if (!withLogin.length) throw new BranchError(students.length ? "Those students have no login yet. Send their logins first." : "No active students there.");
  return {
    userIds: Array.from(new Set(withLogin.map((student) => id(student.user)))),
    skipped: students.filter((student) => !student.user).map((student) => String(student.name || "Student")),
  };
}

function dueFrom(value: unknown) {
  const dueDate = String(value || "");
  if (!isDateKey(dueDate)) throw new BranchError("Pick a due date.");
  if (dueDate < todayKey()) throw new BranchError("The due date has already passed.");
  return academyDateTime(dueDate, "23:59");
}

async function announce(homework: any, actor: Actor, label: string, source: string) {
  void notifyHomeworkAssigned(homework).catch((error) => console.error("Branch homework notification failed", error));
  void recordActivity({
    actor: actor.id,
    type: "homework.created",
    label,
    entityType: "Homework",
    entityId: id(homework),
    metadata: { branch: homework.branch, assignedStudents: (homework.assignedStudents || []).length, source },
  });
}

/** Gives a template to classes or students as one new piece of homework. */
export async function assignTemplate(branch: BranchKey, input: Targets & { templateId?: unknown; dueDate?: unknown }, actor: Actor) {
  await dbConnect();
  if (!isObjectId(input.templateId)) throw new BranchError("Pick the homework to set.");
  const template: any = await AssignmentTemplate.findOne({ _id: input.templateId, isActive: { $ne: false } }).lean();
  if (!template) throw new BranchError("That template is no longer available.", 404);
  const dueAt = dueFrom(input.dueDate);
  const { userIds, skipped } = await resolveTargets(branch, input);
  const homework: any = (
    await Homework.create({
      branch,
      sourceTemplate: template._id,
      instructor: actor.id,
      type: homeworkType(template.activities || []),
      title: template.title,
      description: template.description,
      instructions: template.instructions,
      assignedStudents: userIds,
      assignedBatches: [],
      assignAllStudents: false,
      puzzles: JSON.parse(JSON.stringify(template.puzzles || [])),
      activities: JSON.parse(JSON.stringify(template.activities || [])),
      dueAt,
      numberOfAttempts: template.numberOfAttempts || 1,
      timeLimitMinutes: template.timeLimitMinutes || 0,
      scoring: template.scoring || undefined,
      isPublished: true,
    })
  ).toObject();
  await announce(homework, actor, `Set homework ${template.title} for ${userIds.length} Bowbazar student${userIds.length === 1 ? "" : "s"}`, "branch_template");
  return { id: id(homework), title: String(homework.title), assigned: userIds.length, skipped };
}

const branchHomeworkSchema = homeworkSchema
  .omit({ classroom: true, assignedStudents: true, assignedBatches: true, assignAllStudents: true, dueAt: true })
  .extend({
    slotIds: z.array(z.string()).default([]),
    studentIds: z.array(z.string()).default([]),
    dueDate: z.string(),
  });

/** A home-made assignment from the homework builder. */
export async function createHomework(branch: BranchKey, body: unknown, actor: Actor) {
  await dbConnect();
  const parsed = branchHomeworkSchema.safeParse(body);
  if (!parsed.success) throw new BranchError(parsed.error.issues[0]?.message || "Check the homework and try again.");
  const input = parsed.data;
  if (!input.activities.length && !input.puzzles.length) throw new BranchError("Add at least one activity.");
  const dueAt = dueFrom(input.dueDate);
  const { userIds, skipped } = await resolveTargets(branch, input);
  const homework: any = (
    await Homework.create({
      branch,
      instructor: actor.id,
      type: homeworkType(input.activities),
      title: input.title,
      description: input.description,
      instructions: input.instructions,
      assignedStudents: userIds,
      assignedBatches: [],
      assignAllStudents: false,
      puzzles: input.puzzles,
      activities: input.activities,
      dueAt,
      numberOfAttempts: input.numberOfAttempts,
      timeLimitMinutes: input.timeLimitMinutes,
      isPublished: true,
    })
  ).toObject();
  await announce(homework, actor, `Created homework ${input.title} for ${userIds.length} Bowbazar student${userIds.length === 1 ? "" : "s"}`, "branch_created");
  return { id: id(homework), title: String(homework.title), assigned: userIds.length, skipped };
}

/** Removes a piece of branch homework nobody has done yet. */
export async function deleteBranchHomework(branch: BranchKey, homeworkId: string) {
  await dbConnect();
  if (!isObjectId(homeworkId)) throw new BranchError("Homework not found.", 404);
  const homework: any = await Homework.findOne({ _id: homeworkId, branch }).select("branchAttendance").lean();
  if (!homework) throw new BranchError("Homework not found.", 404);
  if (await Submission.exists({ homework: homework._id })) {
    throw new BranchError("Students have already done this, so it stays on their record.");
  }
  await Homework.deleteOne({ _id: homework._id });
  if (homework.branchAttendance) await BranchAttendance.updateOne({ _id: homework.branchAttendance }, { $pull: { homework: homework._id } });
  await cancelHomeworkDeadlineReminders(homework._id, "Homework was removed.");
  return { deleted: true };
}
