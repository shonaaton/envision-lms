import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Batch } from "@/models/Batch";
import { Classroom } from "@/models/Classroom";
import { User } from "@/models/User";
import { recordActivity } from "@/lib/activity";
import { canAccessFeature } from "@/lib/featureAccess";
import { syncClassroomSessionInstances } from "@/lib/classroomSessionInstances";
import { notifyBatchCoachAssigned } from "@/lib/batchCoachNotifications";

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

function classroomSessions(classroom: any) {
  return Array.isArray(classroom?.generatedSessions) && classroom.generatedSessions.length
    ? classroom.generatedSessions
    : [{ scheduledFor: classroom?.classDate || classroom?.startDate, status: classroom?.status }];
}

function isAssignableFutureSession(session: any, classroom: any, now: Date) {
  const status = String(session?.status || "scheduled").toLowerCase();
  const startsAt = sessionStartsAt(session, classroom?.classDate || classroom?.startDate);
  return Boolean(
    startsAt &&
    startsAt >= now &&
    !session?.actualEndedAt &&
    !FINISHED_SESSION_STATUSES.has(status)
  );
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
    const current = new Set((classroom.students || []).map(idOf));
    let changed = false;

    classroomSessions(classroom).forEach((session: any) => {
      if (!Array.isArray(session.students) || !session.students.length) {
        session.students = Array.from(current);
        changed = true;
      }
      if (!isAssignableFutureSession(session, classroom, now)) return;
      const sessionStudents = new Set((session.students || []).map(idOf));
      const before = sessionStudents.size;
      studentIds.forEach((studentId) => sessionStudents.add(studentId));
      if (sessionStudents.size !== before) {
        session.students = Array.from(sessionStudents);
        changed = true;
      }
    });

    const beforeClassroomCount = current.size;
    studentIds.forEach((studentId) => current.add(studentId));
    if (current.size !== beforeClassroomCount) {
      classroom.students = Array.from(current);
      changed = true;
    }

    if (changed) {
      await classroom.save();
      await syncClassroomSessionInstances(idOf(classroom._id));
      updated += 1;
    }
  }

  return updated;
}

async function enrollmentDateMap(batchId: string, studentIds: string[], existingEnrollments: any[] = []) {
  const map = new Map<string, Date>();
  existingEnrollments.forEach((item: any) => {
    const studentId = idOf(item?.student);
    const enrolledAt = item?.enrolledAt ? new Date(item.enrolledAt) : null;
    if (studentId && enrolledAt && !Number.isNaN(enrolledAt.getTime())) map.set(studentId, enrolledAt);
  });

  const missingIds = studentIds.filter((studentId) => !map.has(studentId));
  if (missingIds.length) {
    const users: any[] = await User.find({ _id: { $in: missingIds } })
      .select("conversionSetup.startingDate conversionSetup.convertedAt conversionSetup.batch createdAt")
      .lean();
    users.forEach((user) => {
      const studentId = idOf(user._id);
      const conversionBatchId = idOf(user.conversionSetup?.batch);
      const preferredDate = conversionBatchId === batchId
        ? user.conversionSetup?.startingDate || user.conversionSetup?.convertedAt || user.createdAt
        : user.createdAt;
      const enrolledAt = preferredDate ? new Date(preferredDate) : new Date();
      map.set(studentId, Number.isNaN(enrolledAt.getTime()) ? new Date() : enrolledAt);
    });
  }

  const now = new Date();
  studentIds.forEach((studentId) => {
    if (!map.has(studentId)) map.set(studentId, now);
  });
  return map;
}

function sessionRosterForEnrollment(classroom: any, session: any, batchStudentDates: Map<string, Date>) {
  const startsAt = sessionStartsAt(session, classroom?.classDate || classroom?.startDate);
  const baseRoster = Array.isArray(session?.students) && session.students.length ? session.students : classroom.students || [];
  const nextRoster = new Map<string, any>();

  baseRoster.forEach((student: any) => {
    const studentId = idOf(student);
    const enrolledAt = batchStudentDates.get(studentId);
    if (!enrolledAt || !startsAt || enrolledAt.getTime() <= startsAt.getTime()) nextRoster.set(studentId, student);
  });

  (classroom.students || []).forEach((student: any) => {
    const studentId = idOf(student);
    const enrolledAt = batchStudentDates.get(studentId);
    if (enrolledAt && startsAt && enrolledAt.getTime() <= startsAt.getTime()) nextRoster.set(studentId, student);
  });

  return Array.from(nextRoster.values());
}

async function reconcileBatchStudentsInClassrooms(batchId: string, batchStudentDates: Map<string, Date>) {
  const classrooms: any[] = await Classroom.find({
    batches: batchId,
    isActive: { $ne: false },
    isSessionInstance: { $ne: true },
  });
  let updated = 0;

  for (const classroom of classrooms) {
    let changed = false;
    classroomSessions(classroom).forEach((session: any) => {
      const nextRoster = sessionRosterForEnrollment(classroom, session, batchStudentDates);
      const before = (session.students || []).map(idOf).filter(Boolean).join("|");
      const after = nextRoster.map(idOf).filter(Boolean).join("|");
      if (before !== after) {
        session.students = nextRoster;
        changed = true;
      }
    });

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
  const existing: any = await Batch.findById(params.id).select("students studentEnrollments coach").lean();
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
    const dates = await enrollmentDateMap(params.id, nextIds, existing.studentEnrollments || []);
    b.studentEnrollments = nextIds.map((studentId: string) => ({ student: studentId, enrolledAt: dates.get(studentId) || new Date() }));
    await b.save();
    if (removedIds.length) await User.updateMany({ _id: { $in: removedIds } }, { $pull: { batches: b?._id } });
    if (nextIds.length) await User.updateMany({ _id: { $in: nextIds } }, { $addToSet: { batches: b?._id } });
    if (addedIds.length) await enrollAddedStudentsInFutureBatchClassrooms(params.id, addedIds);
    await reconcileBatchStudentsInClassrooms(params.id, dates);
  }
  const previousCoachId = idOf(existing.coach);
  const nextCoachId = idOf(b?.coach || body.coach);
  if (body.coach !== undefined && nextCoachId && previousCoachId !== nextCoachId) {
    await notifyBatchCoachAssigned({
      batchId: params.id,
      previousCoachId,
      reason: previousCoachId ? "permanent_coach_changed" : "new_batch_assigned",
    }).catch((error) => console.error("Batch coach notification failed", error));
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
