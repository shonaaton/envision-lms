import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Classroom } from "@/models/Classroom";
import { notFound } from "next/navigation";
import LiveClassroom from "@/components/classroom/LiveClassroom";

export const dynamic = "force-dynamic";

export default async function ClassroomLivePage({ params }: { params: { id: string } }) {
  const session = await auth();
  const userId = (session?.user as any).id;
  const role = (session?.user as any).role as "student" | "instructor" | "admin";
  await dbConnect();
  const classroom = await Classroom.findById(params.id, { _id: 1 }).lean();
  if (!classroom) notFound();

  return <LiveClassroom classroomId={params.id} role={role} userId={userId} />;
}
