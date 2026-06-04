import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Homework, Submission } from "@/models/Homework";
import { homeworkSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  const hw = await Homework.findById(params.id).lean();
  if (!hw) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const role = (session.user as any).role;
  const submission = role === "student" ? await Submission.findOne({ homework: params.id, student: (session.user as any).id }).lean() : null;
  return NextResponse.json({ ...hw, mySubmission: submission });
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || (role !== "instructor" && role !== "admin")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const existing: any = await Homework.findById(params.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (role === "instructor" && existing.instructor.toString() !== (session.user as any).id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const raw = await req.json();
  const merged = {
    classroom: raw.classroom || existing.classroom.toString(),
    title: raw.title ?? existing.title,
    description: raw.description ?? existing.description,
    instructions: raw.instructions ?? existing.instructions,
    assignedStudents: raw.assignedStudents ?? existing.assignedStudents?.map((id: any) => id.toString()) ?? [],
    assignedBatches: raw.assignedBatches ?? existing.assignedBatches?.map((id: any) => id.toString()) ?? [],
    assignAllStudents: raw.assignAllStudents ?? existing.assignAllStudents ?? false,
    dueAt: raw.dueAt === null ? undefined : raw.dueAt ?? existing.dueAt?.toISOString(),
    numberOfAttempts: raw.numberOfAttempts ?? existing.numberOfAttempts ?? 1,
    timeLimitMinutes: raw.timeLimitMinutes ?? existing.timeLimitMinutes ?? 0,
    activities: raw.activities ?? existing.activities ?? [],
    puzzles: raw.puzzles ?? existing.puzzles ?? [],
  };
  const body = homeworkSchema.parse(merged);
  const updated = await Homework.findByIdAndUpdate(params.id, { ...body, dueAt: raw.dueAt === null ? null : body.dueAt }, { new: true });
  return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || (role !== "instructor" && role !== "admin")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const existing: any = await Homework.findById(params.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (role === "instructor" && existing.instructor.toString() !== (session.user as any).id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await Homework.findByIdAndDelete(params.id);
  return NextResponse.json({ ok: true });
}
