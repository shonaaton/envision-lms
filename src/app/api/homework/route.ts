import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Homework } from "@/models/Homework";
import { Classroom } from "@/models/Classroom";
import { homeworkSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  const url = new URL(req.url);
  const classroomId = url.searchParams.get("classroom");
  const userId = (session.user as any).id;
  const role = (session.user as any).role;

  let filter: any = {};
  if (classroomId) filter.classroom = classroomId;
  else if (role === "student") {
    const myClassrooms = await Classroom.find({ students: userId }, { _id: 1 }).lean();
    filter.classroom = { $in: myClassrooms.map((c) => c._id) };
  } else if (role === "instructor") {
    filter.instructor = userId;
  }
  const list = await Homework.find(filter).sort({ createdAt: -1 }).lean();
  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || (role !== "instructor" && role !== "admin")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const body = homeworkSchema.parse(await req.json());
    await dbConnect();
    const created = await Homework.create({ ...body, instructor: (session.user as any).id });
    return NextResponse.json(created);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Bad request" }, { status: 400 });
  }
}
