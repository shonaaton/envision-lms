import { Classroom } from "@/models/Classroom";
import { isSuperAdminSession } from "@/lib/featureAccess";
import { User } from "@/models/User";
import { coachCanAccessClassroomSession } from "@/lib/classroomCoachAccess";

export type AppRole = "student" | "instructor" | "admin";

type ClassroomAccessShape = {
  _id: unknown;
  coach?: unknown;
  instructor?: unknown;
  students?: unknown[];
  generatedSessions?: unknown[];
  isTestClassroom?: boolean;
  testOwner?: unknown;
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

export function canAccessLiveClassroom(classroom: ClassroomAccessShape | null | undefined, role: AppRole, userId: string, scheduledSessionId?: string) {
  if (!classroom) return false;
  if (classroom.isTestClassroom) return false;
  if (role === "admin") return true;
  if (role === "student") {
    return (classroom.students || []).some((student) => objectId(student) === userId);
  }
  return coachCanAccessClassroomSession(classroom, userId, scheduledSessionId);
}

export async function getLiveClassroomForUser(classroomId: string, role: AppRole, userId: string, scheduledSessionId?: string) {
  const classroom: any = await Classroom.findById(classroomId)
    .populate("coach instructor students", "name email username role")
    .lean();

  if (!classroom) return { classroom: null, allowed: false as const };
  if (classroom.isTestClassroom) {
    const ownsSandbox = objectId(classroom.testOwner) === userId;
    const isSuperAdmin = await isSuperAdminSession({ id: userId, role });
    return { classroom, allowed: role === "admin" && ownsSandbox && isSuperAdmin };
  }
  if (role === "student") {
    const student = await User.findById(userId).select("role isActive").lean();
    if ((student as any)?.role !== "student" || (student as any)?.isActive === false) {
      return { classroom, allowed: false as const };
    }
  }
  return { classroom, allowed: canAccessLiveClassroom(classroom, role, userId, scheduledSessionId) as boolean };
}
