import { Classroom } from "@/models/Classroom";

export type AppRole = "student" | "instructor" | "admin";

type ClassroomAccessShape = {
  _id: unknown;
  coach?: unknown;
  instructor?: unknown;
  students?: unknown[];
};

function objectId(value: unknown) {
  if (value && typeof value === "object" && "_id" in (value as Record<string, unknown>)) {
    return objectId((value as { _id?: unknown })._id);
  }
  return value?.toString?.() || String(value || "");
}

export function canAccessLiveClassroom(classroom: ClassroomAccessShape | null | undefined, role: AppRole, userId: string) {
  if (!classroom) return false;
  if (role === "admin") return true;
  if (role === "student") {
    return (classroom.students || []).some((student) => objectId(student) === userId);
  }
  return [classroom.coach, classroom.instructor].some((coach) => objectId(coach) === userId);
}

export async function getLiveClassroomForUser(classroomId: string, role: AppRole, userId: string) {
  const classroom: any = await Classroom.findById(classroomId)
    .populate("coach instructor students", "name email username role")
    .lean();

  if (!classroom) return { classroom: null, allowed: false as const };
  return { classroom, allowed: canAccessLiveClassroom(classroom, role, userId) as boolean };
}
