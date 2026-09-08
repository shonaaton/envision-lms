import { canAccessFeature } from "@/lib/featureAccess";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Batch } from "@/models/Batch";
import { Classroom } from "@/models/Classroom";
import { User } from "@/models/User";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || (role !== "instructor" && role !== "admin" && role !== "sub-admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!(await canAccessFeature("homework", session.user as any, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const userId = (session.user as any).id;
  const classroomFilter = ["admin", "sub-admin"].includes(role) ? {} : { $or: [{ instructor: userId }, { coach: userId }] };
  const classrooms: any[] = await Classroom.find(classroomFilter, {
    title: 1,
    students: 1,
    batches: 1,
  })
    .populate("students", "name email username")
    .lean();

  const classroomBatchIds = new Set<string>();
  classrooms.forEach((classroom) => {
    (classroom.batches || []).forEach((batchId: any) => classroomBatchIds.add(batchId.toString()));
  });

  const batchAccessFilter = ["admin", "sub-admin"].includes(role) ? {} : { $or: [{ coach: userId }, { _id: { $in: Array.from(classroomBatchIds) } }] };
  const batchFilter = { $and: [{ isActive: { $ne: false } }, batchAccessFilter] };
  const batches: any[] = await Batch.find(batchFilter, { name: 1, students: 1, level: 1, coach: 1 })
    .populate("students", "name email username")
    .lean();

  const studentIds = new Set<string>();
  classrooms.forEach((classroom) => (classroom.students || []).forEach((student: any) => studentIds.add(student._id.toString())));
  batches.forEach((batch) => (batch.students || []).forEach((student: any) => studentIds.add(student._id.toString())));

  const students =
    ["admin", "sub-admin"].includes(role)
      ? await User.find({ role: "student", isActive: true }, { name: 1, email: 1, username: 1, batches: 1 }).sort({ name: 1 }).limit(500).lean()
      : await User.find({ _id: { $in: Array.from(studentIds) } }, { name: 1, email: 1, username: 1, batches: 1 }).sort({ name: 1 }).lean();

  return NextResponse.json({ classrooms, batches, students });
}
