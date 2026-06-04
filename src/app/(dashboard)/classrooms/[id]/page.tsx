import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Classroom } from "@/models/Classroom";
import { notFound } from "next/navigation";
import LiveClassroom from "@/components/classroom/LiveClassroom";

export const dynamic = "force-dynamic";

export default async function ClassroomDetail({ params }: { params: { id: string } }) {
  const session = await auth();
  const userId = (session?.user as any).id;
  const role = (session?.user as any).role as "student" | "instructor" | "admin";
  await dbConnect();
  const classroom: any = await Classroom.findById(params.id).lean();
  if (!classroom) notFound();

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">Live Classroom</h1>
        <p className="mt-1 text-sm text-slate-500">Students enter directly into the live board, classroom status, questions, and quiz flow.</p>
      </div>
      <LiveClassroom classroomId={params.id} role={role} userId={userId} />
    </div>
  );
}
