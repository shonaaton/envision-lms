import { NextResponse } from "next/server";

import { dbConnect } from "@/lib/db";
import { pauseStudent } from "@/lib/studentPause";
import { pauseActorFromSession, requireStudentPauseAccess } from "@/lib/studentPauseAccess";
import { Batch } from "@/models/Batch";
import { StudentPause } from "@/models/StudentPause";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requireStudentPauseAccess("view");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "active";
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const batchId = url.searchParams.get("batch") || "";

  const filter: any = {};
  if (status !== "all") filter.status = status;
  if (batchId) filter.batch = batchId;

  const pauses: any[] = await StudentPause.find(filter)
    .populate("student", "name email username countryCode phone isActive")
    .populate("batch", "name")
    .populate("resumeBatch", "name")
    .sort({ pausedUntil: 1, createdAt: -1 })
    .limit(500)
    .lean();

  const filtered = q
    ? pauses.filter((pause) => {
        const student: any = pause.student || {};
        return [student.name, student.email, student.username, pause.batchName]
          .filter(Boolean)
          .some((value: string) => String(value).toLowerCase().includes(q));
      })
    : pauses;

  const [batches, counts] = await Promise.all([
    Batch.find({}).select("name isActive").sort({ name: 1 }).lean(),
    StudentPause.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
  ]);

  return NextResponse.json({
    pauses: filtered,
    batches,
    counts: counts.reduce((acc: Record<string, number>, row: any) => ({ ...acc, [row._id]: row.count }), {}),
  });
}

export async function POST(req: Request) {
  const session = await requireStudentPauseAccess("manage");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();

  const body = await req.json().catch(() => ({}));
  try {
    const result = await pauseStudent({
      studentId: String(body.student || ""),
      batchId: body.batch ? String(body.batch) : undefined,
      pausedFrom: body.pausedFrom,
      pausedUntil: body.pausedUntil,
      expectedRestartDate: body.expectedRestartDate,
      reason: body.reason ? String(body.reason) : undefined,
      actor: pauseActorFromSession(session),
    });
    const pause: any = await StudentPause.findById(result.pause._id)
      .populate("student", "name email username")
      .populate("batch", "name")
      .lean();
    return NextResponse.json({
      pause,
      voidedInvoices: result.voidedInvoices.length,
      classroomsUpdated: result.classroomsUpdated,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not pause this student." }, { status: 400 });
  }
}
