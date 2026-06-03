import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Attendance } from "@/models/Attendance";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  const url = new URL(req.url);
  const classroom = url.searchParams.get("classroom");
  const filter: any = {};
  if (classroom) filter.classroom = classroom;
  const list = await Attendance.find(filter).sort({ sessionDate: -1 }).limit(100).lean();
  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || (role !== "instructor" && role !== "admin")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { classroom, sessionDate, records } = await req.json();
  if (!classroom || !sessionDate) return NextResponse.json({ error: "missing fields" }, { status: 400 });
  await dbConnect();
  const doc = await Attendance.findOneAndUpdate(
    { classroom, sessionDate: new Date(sessionDate) },
    { records, markedBy: (session.user as any).id },
    { upsert: true, new: true }
  );
  return NextResponse.json(doc);
}
