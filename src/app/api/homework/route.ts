import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Homework } from "@/models/Homework";
import { Classroom } from "@/models/Classroom";
import { Batch } from "@/models/Batch";
import { User } from "@/models/User";
import { homeworkSchema } from "@/lib/validation";
import { notifyHomeworkAssigned } from "@/lib/homeworkEmail";
import { recordActivity } from "@/lib/activity";
import { canAccessFeature } from "@/lib/featureAccess";
import { studentHomeworkFilter } from "@/lib/studentHomeworkVisibility";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  const url = new URL(req.url);
  const classroomId = url.searchParams.get("classroom");
  const userId = (session.user as any).id;
  const role = (session.user as any).role;

  let filter: any = {};
  if (classroomId) filter.classroom = classroomId;
  else if (role === "student") {
    filter = { ...filter, ...(await studentHomeworkFilter(userId)) };
  } else if (role === "instructor") {
    filter.instructor = userId;
  }
  const list = await Homework.find(filter).sort({ createdAt: -1 }).lean();
  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const canCreate = role === "instructor" || (session ? await canAccessFeature("homework", session.user as any, "create") : false);
  const canAssign = role === "instructor" || (session ? await canAccessFeature("homework", session.user as any, "assign") : false);
  if (!session || !canCreate || !canAssign) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const body = homeworkSchema.parse(await req.json());
    await dbConnect();
    const created = await Homework.create({ ...body, instructor: (session.user as any).id });
    await notifyHomeworkAssigned(created, req);
    await recordActivity({
      actor: (session.user as any).id,
      type: "homework.created",
      label: `Created homework ${created.title}`,
      entityType: "Homework",
      entityId: created._id.toString(),
      metadata: {
        classroom: created.classroom?.toString?.() || "",
        assignedStudents: Array.isArray(created.assignedStudents) ? created.assignedStudents.length : 0,
        assignedBatches: Array.isArray(created.assignedBatches) ? created.assignedBatches.length : 0,
        assignAllStudents: Boolean(created.assignAllStudents),
        activities: Array.isArray(created.activities) ? created.activities.length : 0,
        dueAt: created.dueAt || null,
        source: "manual_coach_admin",
      },
    });
    return NextResponse.json(created);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Bad request" }, { status: 400 });
  }
}
