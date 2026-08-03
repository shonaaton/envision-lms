import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { deriveScheduledSessionStatus, isJoinWindowOpen } from "@/lib/classroomSessions";
import { resolveScheduledSession } from "@/lib/classroomLiveSession";
import { canAccessFeature, isSuperAdminSession } from "@/lib/featureAccess";
import { isCurrentStudent } from "@/lib/studentAccess";
import { Classroom } from "@/models/Classroom";
import { ClassroomSession } from "@/models/ClassroomLive";
import { notFound, redirect } from "next/navigation";
import LiveClassroom from "@/components/classroom/LiveClassroom";
import { coachCanAccessClassroomSession } from "@/lib/classroomCoachAccess";

export const dynamic = "force-dynamic";

function participantHasAccess(classroom: any, role: string, userId: string, scheduledSessionId?: string) {
  if (role === "admin" || role === "sub-admin") return true;
  if (role === "student") return (classroom.students || []).some((student: any) => String(student) === userId || String(student?._id || "") === userId);
  return coachCanAccessClassroomSession(classroom, userId, scheduledSessionId);
}

function pickScheduledSession(classroom: any, requestedSessionId: string | undefined, role: string, userId: string) {
  const allSessions = Array.isArray(classroom?.generatedSessions) ? classroom.generatedSessions : [];
  const sessions = role === "instructor"
    ? allSessions.filter((item: any) => coachCanAccessClassroomSession(classroom, userId, String(item?._id || "")))
    : allSessions;
  if (requestedSessionId) {
    const exact = sessions.find((item: any) => String(item?._id || "") === requestedSessionId);
    if (exact) return exact;
  }
  const now = new Date();
  const active = sessions.find((session: any) => {
    const status = deriveScheduledSessionStatus(session, now);
    return status === "join_available" || status === "ongoing";
  });
  if (active) return active;
  const upcoming = sessions
    .filter((session: any) => deriveScheduledSessionStatus(session, now) === "upcoming")
    .sort((a: any, b: any) => new Date(a.scheduledFor || 0).getTime() - new Date(b.scheduledFor || 0).getTime())[0];
  if (upcoming) return upcoming;
  return sessions[0] || resolveScheduledSession(classroom, requestedSessionId);
}

export default async function ClassroomLivePage({ params, searchParams }: { params: { id: string }; searchParams: { session?: string } }) {
  const session = await auth();
  if (!session) redirect("/login");
  const userId = (session?.user as any).id;
  const role = (session?.user as any).role as "student" | "instructor" | "admin" | "sub-admin";
  if (!(await canAccessFeature("classrooms", session.user as any, "join"))) redirect("/classrooms");
  await dbConnect();
  const classroom: any = await Classroom.findById(params.id).lean();
  if (!classroom) notFound();
  const isSuperAdmin = await isSuperAdminSession(session?.user as any);
  if (classroom.isTestClassroom && (!isSuperAdmin || String(classroom.testOwner || "") !== userId)) redirect("/dashboard");
  if (role === "student" && !(await isCurrentStudent(userId))) redirect("/dashboard");

  if (role !== "admin" && role !== "sub-admin") {
    const scheduledSession: any = pickScheduledSession(classroom, searchParams.session, role, userId);
    if (!scheduledSession) redirect("/classrooms");
    if (!participantHasAccess(classroom, role, userId, String(scheduledSession._id))) redirect("/dashboard");
    if (!isJoinWindowOpen(scheduledSession)) redirect("/classrooms");
    const sessionStatus = deriveScheduledSessionStatus(scheduledSession);
    if (["completed", "cancelled", "rescheduled", "missed"].includes(sessionStatus)) redirect("/classrooms");
    const liveSession: any = await ClassroomSession.findOne({ classroom: params.id, scheduledSessionId: String(scheduledSession._id) }).lean();
    if (liveSession?.status === "ended") redirect("/classrooms");
    return <LiveClassroom classroomId={params.id} role={role} userId={userId} sessionId={String(scheduledSession._id)} />;
  }

  if (!participantHasAccess(classroom, role, userId)) redirect("/dashboard");

  return <LiveClassroom classroomId={params.id} role={role} userId={userId} sessionId={searchParams.session} />;
}
