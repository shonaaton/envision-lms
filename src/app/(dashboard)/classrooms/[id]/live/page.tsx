import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { deriveScheduledSessionStatus } from "@/lib/classroomSessions";
import { resolveScheduledSession } from "@/lib/classroomLiveSession";
import { Classroom } from "@/models/Classroom";
import { ClassroomSession } from "@/models/ClassroomLive";
import { notFound, redirect } from "next/navigation";
import LiveClassroom from "@/components/classroom/LiveClassroom";

export const dynamic = "force-dynamic";

function participantHasAccess(classroom: any, role: string, userId: string) {
  if (role === "admin") return true;
  if (role === "student") return (classroom.students || []).some((student: any) => String(student) === userId || String(student?._id || "") === userId);
  return [classroom.coach, classroom.instructor].some((coach: any) => String(coach) === userId || String(coach?._id || "") === userId);
}

function pickScheduledSession(classroom: any, requestedSessionId?: string) {
  const sessions = Array.isArray(classroom?.generatedSessions) ? classroom.generatedSessions : [];
  if (requestedSessionId) {
    const exact = resolveScheduledSession(classroom, requestedSessionId);
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
  return resolveScheduledSession(classroom, requestedSessionId);
}

export default async function ClassroomLivePage({ params, searchParams }: { params: { id: string }; searchParams: { session?: string } }) {
  const session = await auth();
  const userId = (session?.user as any).id;
  const role = (session?.user as any).role as "student" | "instructor" | "admin";
  await dbConnect();
  const classroom: any = await Classroom.findById(params.id).lean();
  if (!classroom) notFound();
  if (!participantHasAccess(classroom, role, userId)) redirect("/dashboard");

  if (role !== "admin") {
    const scheduledSession: any = pickScheduledSession(classroom, searchParams.session);
    if (!scheduledSession) redirect("/classrooms");
    const sessionStatus = deriveScheduledSessionStatus(scheduledSession);
    if (["completed", "cancelled", "rescheduled", "missed"].includes(sessionStatus)) redirect("/classrooms");
    const liveSession: any = await ClassroomSession.findOne({ classroom: params.id, scheduledSessionId: String(scheduledSession._id) }).lean();
    if (liveSession?.status === "ended") redirect("/classrooms");
    return <LiveClassroom classroomId={params.id} role={role} userId={userId} sessionId={String(scheduledSession._id)} />;
  }

  return <LiveClassroom classroomId={params.id} role={role} userId={userId} sessionId={searchParams.session} />;
}
