import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Classroom } from "@/models/Classroom";
import { classroomSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  const filter = role === "admin" ? {} : role === "instructor" ? { instructor: userId } : { students: userId };
  const list = await Classroom.find(filter).lean();
  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || (role !== "instructor" && role !== "admin")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const body = classroomSchema.parse(await req.json());
    await dbConnect();
    const created = await Classroom.create({ ...body, instructor: (session.user as any).id });
    return NextResponse.json(created);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Bad request" }, { status: 400 });
  }
}
