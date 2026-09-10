import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Batch } from "@/models/Batch";
import { Classroom } from "@/models/Classroom";
import { User } from "@/models/User";
import { canAccessFeature } from "@/lib/featureAccess";
import { coachClassroomQuery } from "@/lib/classroomCoachAccess";
import { closedGroupCountsByCoach, DEACTIVATION_CLOSURE_REASON } from "@/lib/groupLifecycle";

export const dynamic = "force-dynamic";

const CLASSROOM_FIELDS = "name email username";

/**
 * The batches and classrooms that are no longer on the coach's board, in the two
 * states they can be in: closed, because their last attending student was
 * deactivated, and paused, because that student is away for a fixed window and
 * coming back. A coach sees their own; an admin sees every one of them, plus a
 * per-coach tally of how many groups have been closed under each coach.
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
  const coachClassrooms = manager ? {} : coachClassroomQuery(userId);
  const coachBatches = manager ? {} : { coach: userId };

  const findClassrooms = (state: Record<string, unknown>) =>
    Classroom.find({ ...state, isSessionInstance: { $ne: true }, isTestClassroom: { $ne: true }, ...coachClassrooms })
      .populate("coach instructor", CLASSROOM_FIELDS)
      .populate("students", "name email username isActive deactivatedAt")
      .populate("closedForStudents", "name email username deactivatedAt")
      .populate("pausedForStudents", "name email username pausedUntil")
      .populate("batches", "name")
      .sort({ closedAt: -1, pausedAt: -1 })
      .lean();

  const findBatches = (state: Record<string, unknown>) =>
    Batch.find({ ...state, ...coachBatches })
      .populate("coach", CLASSROOM_FIELDS)
      .populate("students", "name email username isActive deactivatedAt")
      .populate("closedForStudents", "name email username deactivatedAt")
      .populate("pausedForStudents", "name email username pausedUntil")
      .sort({ closedAt: -1, pausedAt: -1 })
      .lean();

  const closedState = { isActive: false, closedReason: DEACTIVATION_CLOSURE_REASON };
  // Closing a group does not clear its pause flag, so a group that was paused
  // for a student and then closed when that student was deactivated matches
  // both states. Closed is the later and the final one, so it wins and the group
  // is listed once.
  const pausedState = { isPaused: true, isActive: { $ne: false } };

  const [closedClassrooms, closedBatches, pausedClassrooms, pausedBatches] = await Promise.all([
    findClassrooms(closedState),
    findBatches(closedState),
    findClassrooms(pausedState),
    findBatches(pausedState),
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
    // Kept flat as well as grouped: `classrooms` and `batches` are the closed
    // ones, which is what every existing caller reads.
    classrooms: closedClassrooms,
    batches: closedBatches,
    closed: { classrooms: closedClassrooms, batches: closedBatches },
    paused: { classrooms: pausedClassrooms, batches: pausedBatches },
    coaches: coachSummary,
    totals: {
      classrooms: closedClassrooms.length,
      batches: closedBatches.length,
      groups: closedClassrooms.length + closedBatches.length,
      pausedClassrooms: pausedClassrooms.length,
      pausedBatches: pausedBatches.length,
      pausedGroups: pausedClassrooms.length + pausedBatches.length,
    },
  });
}
