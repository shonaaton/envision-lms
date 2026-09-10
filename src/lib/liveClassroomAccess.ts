import { Classroom } from "@/models/Classroom";
import { rosterForSession, studentExitDate } from "@/lib/classroomStudentExits";
import { canAccessFeature, isSuperAdminSession } from "@/lib/featureAccess";
import { User } from "@/models/User";
import { coachCanAccessClassroomSession } from "@/lib/classroomCoachAccess";
import { getClassroomCreditEligibility } from "@/lib/classroomCreditAccess";
import { resolveScheduledSession } from "@/lib/classroomLiveSession";
import { isJoinWindowOpen } from "@/lib/classroomSessions";

export type AppRole = "student" | "instructor" | "admin" | "sub-admin";

type ClassroomAccessShape = {
  _id: unknown;
  coach?: unknown;
  instructor?: unknown;
  students?: unknown[];
  generatedSessions?: unknown[];
  isTestClassroom?: boolean;
  testOwner?: unknown;
  studentExits?: unknown[];
  classDate?: unknown;
  startDate?: unknown;
};

function objectId(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown> & { toHexString?: () => string; toString?: () => string };
    if (typeof objectValue.toHexString === "function") return objectValue.toHexString();
    if ("_id" in objectValue && objectValue._id && objectValue._id !== value) {
      return objectId(objectValue._id);
    }
    if (typeof objectValue.toString === "function") return objectValue.toString();
  }
  return String(value);
}

function studentsForSession(classroom: ClassroomAccessShape, scheduledSessionId?: string) {
  const session = scheduledSessionId && Array.isArray(classroom.generatedSessions)
    ? classroom.generatedSessions.find((item: any) => objectId(item?._id) === scheduledSessionId)
    : null;
  // `rosterForSession` applies both rules at once: a session with its own list
  // owns its roster, and anyone who left the classroom before this class is off
  // it either way - including when the fallback to `classroom.students` would
  // otherwise hand a departed student their old batch back.
  return rosterForSession(classroom, session);
}

export function canAccessLiveClassroom(classroom: ClassroomAccessShape | null | undefined, role: AppRole, userId: string, scheduledSessionId?: string) {
  if (!classroom) return false;
  if (classroom.isTestClassroom) return false;
  if (role === "admin" || role === "sub-admin") return true;
  if (role === "student") {
    return studentsForSession(classroom, scheduledSessionId).some((student: unknown) => objectId(student) === userId);
  }
  return coachCanAccessClassroomSession(classroom, userId, scheduledSessionId);
}

/**
 * Why entry was refused, in words a person can act on.
 *
 * A bare `allowed: false` became a bare "Forbidden" on the student's screen,
 * which says nothing about which of six unrelated rules stopped them - a
 * missing permission, a deactivated account, an unpaid balance, a session that
 * has not opened yet, or simply not being on the roster. The caller passes this
 * through so the reason reaches the person looking at the screen and the logs.
 */
export type LiveClassroomDenial =
  | "classroom_not_found"
  | "no_join_permission"
  | "sandbox_classroom"
  | "not_a_current_student"
  | "credit_balance_blocked"
  | "no_scheduled_session"
  | "session_not_open"
  | "not_on_the_roster"
  | "left_this_classroom";

export const LIVE_CLASSROOM_DENIAL_MESSAGES: Record<LiveClassroomDenial, string> = {
  classroom_not_found: "This classroom no longer exists.",
  no_join_permission: "Your account does not have permission to join classes.",
  sandbox_classroom: "This is a test classroom and can only be opened by the admin who created it.",
  not_a_current_student: "This student account is not active.",
  credit_balance_blocked: "Class credits have run out. Recharge to join a class.",
  no_scheduled_session: "This class has no scheduled session to join.",
  session_not_open: "This class is not open yet. The room opens 5 minutes before the start time.",
  not_on_the_roster: "You are not on the student list for this class.",
  left_this_classroom: "You have moved to another batch. Your past classes and homework are still on your account, but this class is not yours to join.",
};

export async function getLiveClassroomForUser(classroomId: string, role: AppRole, userId: string, scheduledSessionId?: string) {
  const canJoin = await canAccessFeature("classrooms", { id: userId, role }, "join");
  const classroom: any = await Classroom.findById(classroomId)
    .populate("coach instructor students", "name email username role")
    .populate("generatedSessions.students", "name email username role")
    .lean();

  const deny = (reason: LiveClassroomDenial) => ({ classroom, allowed: false as const, reason });

  if (!classroom) return { classroom: null, allowed: false as const, reason: "classroom_not_found" as const };
  if (!canJoin) return deny("no_join_permission");
  if (classroom.isTestClassroom) {
    const ownsSandbox = objectId(classroom.testOwner) === userId;
    const isSuperAdmin = await isSuperAdminSession({ id: userId, role });
    if (!(role === "admin" && ownsSandbox && isSuperAdmin)) return deny("sandbox_classroom");
    return { classroom, allowed: true as const, reason: undefined };
  }
  if (role === "student") {
    const student = await User.findById(userId).select("role isActive").lean();
    if ((student as any)?.role !== "student" || (student as any)?.isActive === false) {
      return deny("not_a_current_student");
    }
    // Credit-plan students at -1 or below have used their final grace class
    // and cannot enter any classroom until they recharge. Enforced here so
    // every live-classroom API route is covered, not just the join button.
    const creditEligibility = await getClassroomCreditEligibility(userId, role);
    if (creditEligibility.blocked) {
      return deny("credit_balance_blocked");
    }
  }
  const scheduledSession: any = resolveScheduledSession(classroom, scheduledSessionId);
  if (!scheduledSession) return deny("no_scheduled_session");
  const sessionOpen = Boolean(
    isJoinWindowOpen(scheduledSession) ||
    (scheduledSession.actualStartedAt && !scheduledSession.actualEndedAt && scheduledSession.status !== "cancelled")
  );
  if (!sessionOpen) return deny("session_not_open");
  if (!canAccessLiveClassroom(classroom, role, userId, scheduledSessionId)) {
    // Say which of the two it is: never on this roster, or moved on from it.
    const movedOn = role === "student" && Boolean(studentExitDate(classroom, userId));
    return deny(movedOn ? "left_this_classroom" : "not_on_the_roster");
  }
  return { classroom, allowed: true as const, reason: undefined };
}
