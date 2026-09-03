import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Batch } from "@/models/Batch";
import { Classroom } from "@/models/Classroom";
import { User } from "@/models/User";
import { recordActivity } from "@/lib/activity";
import { canAccessFeature } from "@/lib/featureAccess";
import { syncClassroomSessionInstances } from "@/lib/classroomSessionInstances";

export const dynamic = "force-dynamic";

async function requireBatchAccess(permission: "edit" | "delete") {
  const session = await auth();
  if (!session?.user) return null;
  const user = session.user as any;
  const allowed =
    (await canAccessFeature("courseManagement", user, permission)) ||
    (await canAccessFeature("userManagement", user, permission));
  return allowed ? session : null;
}

function idOf(value: any) {
  return String(value?._id || value || "");
}

const FINISHED_SESSION_STATUSES = new Set([
  "completed",
  "cancelled",
  "missed",
  "abandoned",
  "absent",
  "coach_no_show",
  "student_no_show",
  "technical_issue",
]);

function sessionStartsAt(session: any, fallbackDate?: any) {
  const value = session?.scheduledFor || session?.classDate || fallbackDate;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hasAssignableFutureSession(classroom: any, now: Date) {
  const sessions = Array.isArray(classroom?.generatedSessions) && classroom.generatedSessions.length
    ? classroom.generatedSessions
    : [{ scheduledFor: classroom?.classDate || classroom?.startDate, status: classroom?.status }];

  return sessions.some((session: any) => {
    const status = String(session?.status || "scheduled").toLowerCase();
    const startsAt = sessionStartsAt(session, classroom?.classDate || classroom?.startDate);
    return Boolean(
      startsAt &&
      startsAt >= now &&
      !session?.actualEndedAt &&
      !FINISHED_SESSION_STATUSES.has(status)
    );
  });
}

async function enrollAddedStudentsInFutureBatchClassrooms(batchId: string, studentIds: string[]) {
  if (!studentIds.length) return 0;
  const now = new Date();
  const classrooms: any[] = await Classroom.find({
    batches: batchId,
    isActive: { $ne: false },
    isSessionInstance: { $ne: true },
    status: { $nin: ["completed", "cancelled"] },
  });
  let updated = 0;

  for (const classroom of classrooms) {
    if (!hasAssignableFutureSession(classroom, now)) continue;

    const current = new Set((classroom.students || []).map(idOf));
    const before = current.size;
    studentIds.forEach((studentId) => current.add(studentId));
    const changed = current.size !== before;
    classroom.students = Array.from(current);

    if (changed) {
      await classroom.save();
      await syncClassroomSessionInstances(idOf(classroom._id));
      updated += 1;
    }
  }

  return updated;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await requireBatchAccess("edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actorId = (session!.user as any).id;
  await dbConnect();
  const body = await req.json();
  const existing: any = await Batch.findById(params.id).select("students").lean();
  if (!existing) return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  if (Array.isArray(body.students)) {
    const activeStudents = body.students.length
      ? await User.find({ _id: { $in: body.students }, role: "student", isActive: { $ne: false } }).select("_id").lean()
      : [];
    body.students = activeStudents.map((student: any) => student._id.toString());
  }
  const b = await Batch.findByIdAndUpdate(params.id, body, { new: true });
  if (Array.isArray(body.students)) {
    const previousIds = (existing.students || []).map((student: any) => student.toString());
    const nextIds = body.students.map(String);
    const removedIds = previousIds.filter((studentId: string) => !nextIds.includes(studentId));
    const addedIds = nextIds.filter((studentId: string) => !previousIds.includes(studentId));
    if (removedIds.length) await User.updateMany({ _id: { $in: removedIds } }, { $pull: { batches: b?._id } });
    if (nextIds.length) await User.updateMany({ _id: { $in: nextIds } }, { $addToSet: { batches: b?._id } });
    await enrollAddedStudentsInFutureBatchClassrooms(params.id, addedIds.length ? addedIds : nextIds);
  }
  await recordActivity({
    actor: actorId,
    type: "batch.updated",
    label: `Updated batch ${b?.name ?? "batch"}`,
    entityType: "Batch",
    entityId: params.id,
    metadata: { fields: Object.keys(body) },
  });
  return NextResponse.json(b);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await requireBatchAccess("delete");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actorId = (session!.user as any).id;
  await dbConnect();
  const b = await Batch.findByIdAndDelete(params.id);
  if (b?._id) await User.updateMany({ batches: b._id }, { $pull: { batches: b._id } });
  await recordActivity({
    actor: actorId,
    type: "batch.deleted",
    label: `Deleted batch ${b?.name ?? "batch"}`,
    entityType: "Batch",
    entityId: params.id,
  });
  return NextResponse.json({ ok: true });
}
