import "server-only";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { ExamError, assignExam, cancelExam, listAssignmentsForStaff, listPapers } from "@/lib/exams/examService";
import { examLevelLabel } from "@/lib/exams/examRules";
import { ExamAssignment } from "@/models/Exam";
import { User } from "@/models/User";
import { BranchStudent } from "@/models/Branch";
import { BranchError } from "./errors";
import type { BranchKey } from "./scope";

/**
 * The academy's level exams, for a branch's own students. The papers and the
 * exam itself are the online Exam Center's; this only assigns them to the
 * branch's students and shows the branch's results.
 */

const id = (value: unknown) => String((value as any)?._id ?? value ?? "");
const isObjectId = (value: unknown) => typeof value === "string" && Types.ObjectId.isValid(value);

async function branchUserIds(branch: BranchKey) {
  const users: any[] = await User.find({ branch, role: "student" }).select("_id").lean();
  return users.map((user) => id(user));
}

function asBranchError(error: unknown): never {
  if (error instanceof ExamError) throw new BranchError(error.message, error.status);
  throw error;
}

export async function branchExams(branch: BranchKey) {
  await dbConnect();
  const [papers, userIds] = await Promise.all([listPapers(), branchUserIds(branch)]);
  const results = userIds.length ? await listAssignmentsForStaff({ studentIds: userIds }) : [];
  return {
    papers: papers.filter((paper) => paper.status === "published").map((paper) => ({ tier: paper.tier, levelNumber: paper.levelNumber, label: paper.levelLabel })),
    results: results.map((row: any) => ({
      id: row.id,
      studentName: row.student?.name || "",
      levelLabel: row.levelLabel,
      status: row.status as string,
      assignedAt: row.assignedAt,
      availableUntil: row.availableUntil,
      submittedAt: row.submittedAt,
      score: row.score ? { total: row.score.total, max: row.score.max, percent: row.score.percent } : null,
      positionsSolved: row.positionsSolved,
      mcqCorrect: row.mcqCorrect,
      certificateUrl: row.certificate?.url || "",
    })),
  };
}

/** Assigns a published paper to chosen students, or to everyone in chosen classes. */
export async function assignBranchExam(branch: BranchKey, input: any, actor: { id: string; name?: string }) {
  await dbConnect();
  const studentIds = (Array.isArray(input?.studentIds) ? input.studentIds : []).filter(isObjectId);
  const slotIds = (Array.isArray(input?.slotIds) ? input.slotIds : []).filter(isObjectId);
  if (!studentIds.length && !slotIds.length) throw new BranchError("Pick students or a class.");
  const students: any[] = await BranchStudent.find({
    branch,
    status: "active",
    $or: [...(studentIds.length ? [{ _id: { $in: studentIds } }] : []), ...(slotIds.length ? [{ slots: { $in: slotIds } }] : [])],
  })
    .select("user")
    .lean();
  const userIds = students.map((student) => id(student.user)).filter(Boolean);
  if (!userIds.length) throw new BranchError("None of those students is active.");
  const result = await assignExam({ studentIds: userIds, tier: input?.tier, levelNumber: Number(input?.levelNumber), source: "manual", actorId: actor.id }).catch(asBranchError);
  void recordActivity({
    actor: actor.id,
    type: "branch.exam_assigned",
    label: `Assigned the ${examLevelLabel(input?.tier, Number(input?.levelNumber))} exam to ${result.assigned} ${branch} students`,
  });
  return result;
}

/** Cancels an exam not yet started - only one of this branch's own. */
export async function cancelBranchExam(branch: BranchKey, assignmentId: string, actor: { id: string }) {
  await dbConnect();
  if (!isObjectId(assignmentId)) throw new BranchError("Not found.", 404);
  const assignment: any = await ExamAssignment.findById(assignmentId).select("student").lean();
  if (!assignment || !(await User.exists({ _id: assignment.student, branch }))) throw new BranchError("Not found.", 404);
  return cancelExam(assignmentId, actor.id).catch(asBranchError);
}
