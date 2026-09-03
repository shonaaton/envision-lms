import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Homework, Submission } from "@/models/Homework";
import { StudentReward } from "@/models/ClassroomLive";
import { homeworkSchema } from "@/lib/validation";
import { canStudentAccessHomework } from "@/lib/homeworkAccess";
import { cancelHomeworkDeadlineReminders, queueHomeworkDeadlineReminders } from "@/lib/homeworkEmailReminders";
import { recordActivity } from "@/lib/activity";
import { canAccessFeature } from "@/lib/featureAccess";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  const hw = await Homework.findById(params.id).lean();
  if (!hw) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const role = (session.user as any).role;
  const userId = (session.user as any).id;
  if (role === "student" && !(await canStudentAccessHomework(hw, userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const [submission, reward]: [any, any] = role === "student"
    ? await Promise.all([
        Submission.findOne({ homework: params.id, student: userId }).lean(),
        StudentReward.findOne({ student: userId, sourceType: "homework_submission", sourceId: params.id }).lean(),
      ])
    : [null, null];
  const mySubmission = submission ? {
    ...submission,
    rewardSummary: reward
      ? {
          xp: Number(reward.xp || 0),
          coins: Number(reward.coins || 0),
          badge: String(reward.badge || ""),
        }
      : undefined,
  } : null;
  return NextResponse.json({ ...hw, mySubmission });
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const canEdit = role === "instructor" || (session ? await canAccessFeature("homework", session.user as any, "edit") : false);
  if (!session || !canEdit) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const existing: any = await Homework.findById(params.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (role === "instructor" && existing.instructor.toString() !== (session.user as any).id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const raw = await req.json();
  const merged = {
    classroom: raw.classroom || existing.classroom.toString(),
    title: raw.title ?? existing.title,
    description: raw.description ?? existing.description,
    instructions: raw.instructions ?? existing.instructions,
    assignedStudents: raw.assignedStudents ?? existing.assignedStudents?.map((id: any) => id.toString()) ?? [],
    assignedBatches: raw.assignedBatches ?? existing.assignedBatches?.map((id: any) => id.toString()) ?? [],
    assignAllStudents: raw.assignAllStudents ?? existing.assignAllStudents ?? false,
    dueAt: raw.dueAt === null ? undefined : raw.dueAt ?? existing.dueAt?.toISOString(),
    numberOfAttempts: raw.numberOfAttempts ?? existing.numberOfAttempts ?? 1,
    timeLimitMinutes: raw.timeLimitMinutes ?? existing.timeLimitMinutes ?? 0,
    activities: raw.activities ?? existing.activities ?? [],
    puzzles: raw.puzzles ?? existing.puzzles ?? [],
  };
  const body = homeworkSchema.parse(merged);
  const updated = await Homework.findByIdAndUpdate(params.id, { ...body, dueAt: raw.dueAt === null ? null : body.dueAt }, { new: true });
  await queueHomeworkDeadlineReminders(updated);
  await recordActivity({
    actor: (session.user as any).id,
    type: "homework.updated",
    label: `Updated homework ${updated?.title || existing.title}`,
    entityType: "Homework",
    entityId: params.id,
    metadata: {
      previousTitle: existing.title,
      title: updated?.title || "",
      previousDueAt: existing.dueAt || null,
      dueAt: updated?.dueAt || null,
      assignedStudents: Array.isArray(updated?.assignedStudents) ? updated.assignedStudents.length : 0,
      assignedBatches: Array.isArray(updated?.assignedBatches) ? updated.assignedBatches.length : 0,
      activities: Array.isArray(updated?.activities) ? updated.activities.length : 0,
      source: "manual_coach_admin",
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const canDelete = session ? await canAccessFeature("homework", session.user as any, "delete") : false;
  if (!session || !canDelete) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const existing: any = await Homework.findById(params.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (role === "instructor" && existing.instructor.toString() !== (session.user as any).id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await cancelHomeworkDeadlineReminders(params.id);
  await Homework.findByIdAndDelete(params.id);
  await recordActivity({
    actor: (session.user as any).id,
    type: "homework.deleted",
    label: `Deleted homework ${existing.title}`,
    entityType: "Homework",
    entityId: params.id,
    metadata: {
      classroom: existing.classroom?.toString?.() || "",
      assignedStudents: Array.isArray(existing.assignedStudents) ? existing.assignedStudents.length : 0,
      assignedBatches: Array.isArray(existing.assignedBatches) ? existing.assignedBatches.length : 0,
      source: "manual_coach_admin",
    },
  });
  return NextResponse.json({ ok: true });
}
