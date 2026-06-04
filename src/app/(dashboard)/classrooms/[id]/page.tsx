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
    <div className="min-h-[calc(100vh-120px)] text-slate-950">
      <LiveClassroom classroomId={params.id} role={role} userId={userId} />
    </div>
  );
}
