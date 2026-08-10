import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { sendManualHomeworkReminder } from "@/lib/homeworkEmailReminders";
import { Homework } from "@/models/Homework";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || (role !== "instructor" && role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await dbConnect();
  const homework: any = await Homework.findById(params.id).select("instructor").lean();
  if (!homework) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (role === "instructor" && homework.instructor?.toString?.() !== (session.user as any).id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await sendManualHomeworkReminder(params.id, req);
  return NextResponse.json({ ok: true, ...result });
}
