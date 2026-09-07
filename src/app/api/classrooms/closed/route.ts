import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Batch } from "@/models/Batch";
import { Classroom } from "@/models/Classroom";
import { User } from "@/models/User";
import { canAccessFeature } from "@/lib/featureAccess";
import { coachClassroomQuery } from "@/lib/classroomCoachAccess";
import { closedGroupCountsByCoach, DEACTIVATION_CLOSURE_REASON } from "@/lib/studentDeactivation";

export const dynamic = "force-dynamic";

/**
 * The batches and classrooms that were closed when their last active student was
 * deactivated. A coach sees their own; an admin sees every one of them together
 * with a per-coach tally of how many groups have been closed under each coach.
 */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessFeature("classrooms", session.user as any, "view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const role = String((session.user as any).role || "");
  const userId = String((session.user as any).id || "");
  if (!["admin", "sub-admin", "instructor"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await dbConnect();

  const manager = role === "admin" || role === "sub-admin";
  const closedFilter = { isActive: false, closedReason: DEACTIVATION_CLOSURE_REASON };

  const [classrooms, batches] = await Promise.all([
    Classroom.find({
      ...closedFilter,
      isSessionInstance: { $ne: true },
      isTestClassroom: { $ne: true },
      ...(manager ? {} : coachClassroomQuery(userId)),
    })
      .populate("coach instructor", "name email username")
      .populate("students", "name email username isActive deactivatedAt")
      .populate("closedForStudents", "name email username deactivatedAt")
      .populate("batches", "name")
      .sort({ closedAt: -1 })
      .lean(),
    Batch.find({ ...closedFilter, ...(manager ? {} : { coach: userId }) })
      .populate("coach", "name email username")
      .populate("students", "name email username isActive deactivatedAt")
      .populate("closedForStudents", "name email username deactivatedAt")
      .sort({ closedAt: -1 })
      .lean(),
  ]);

  const counts = await closedGroupCountsByCoach(manager ? undefined : [userId]);
  const coachIds = Array.from(counts.keys());
  const coaches: any[] = coachIds.length
    ? await User.find({ _id: { $in: coachIds } }).select("name username email isActive").lean()
    : [];
  const coachById = new Map(coaches.map((coach: any) => [String(coach._id), coach]));

  const coachSummary = coachIds
    .map((id) => {
      const count = counts.get(id)!;
      const coach = coachById.get(id);
      return {
        coach: id,
        name: coach?.name || coach?.username || "Unassigned coach",
        username: coach?.username || "",
        email: coach?.email || "",
        isActive: coach?.isActive !== false,
        closedClassrooms: count.closedClassrooms,
        closedBatches: count.closedBatches,
        total: count.total,
        lastClosedAt: count.lastClosedAt,
      };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  return NextResponse.json({
    role,
    manager,
    classrooms,
    batches,
    coaches: coachSummary,
    totals: {
      classrooms: classrooms.length,
      batches: batches.length,
      groups: classrooms.length + batches.length,
    },
  });
}
