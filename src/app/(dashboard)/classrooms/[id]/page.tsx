import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Classroom } from "@/models/Classroom";
import { notFound, redirect } from "next/navigation";
import LiveClassroom from "@/components/classroom/LiveClassroom";

export const dynamic = "force-dynamic";

function participantHasAccess(classroom: any, role: string, userId: string) {
  if (role === "admin") return true;
  if (role === "student") return (classroom.students || []).some((student: any) => String(student) === userId || String(student?._id || "") === userId);
  return [classroom.coach, classroom.instructor].some((coach: any) => String(coach) === userId || String(coach?._id || "") === userId);
}

export default async function ClassroomDetail({ params, searchParams }: { params: { id: string }; searchParams: { session?: string } }) {
  const session = await auth();
  const userId = (session?.user as any).id;
  const role = (session?.user as any).role as "student" | "instructor" | "admin";
  await dbConnect();
  const classroom: any = await Classroom.findById(params.id).lean();
  if (!classroom) notFound();
  if (!participantHasAccess(classroom, role, userId)) redirect("/dashboard");

  if (role !== "admin") {
    const sessionId = searchParams.session;
    if (!sessionId) redirect("/classrooms");
    const scheduledSession = (classroom.generatedSessions || []).find((item: any) => String(item._id) === sessionId);
    if (!scheduledSession) redirect("/classrooms");
  }

  return (
    <div className="min-h-[calc(100vh-120px)] text-slate-950">
      <LiveClassroom classroomId={params.id} role={role} userId={userId} />
    </div>
  );
}
