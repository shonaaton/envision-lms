import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { canAccessFeature } from "@/lib/featureAccess";
import { transferStudentBatch } from "@/lib/studentBatchTransfer";
import { Batch } from "@/models/Batch";
import { User } from "@/models/User";

export const dynamic = "force-dynamic";

/**
 * Moving a student between batches changes both who teaches them and what they
 * can open, so it takes the same rights as editing a batch or a user - the two
 * permissions that already govern each half of it.
 */
async function requireTransferAccess() {
  const session = await auth();
  if (!session?.user) return null;
  const user = session.user as any;
  const allowed =
    (await canAccessFeature("courseManagement", user, "edit")) ||
    (await canAccessFeature("userManagement", user, "edit"));
  return allowed ? session : null;
}

/** The student's current batches and every batch they could be moved into. */
export async function GET(req: Request) {
  const session = await requireTransferAccess();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();

  const studentId = new URL(req.url).searchParams.get("student") || "";
  const [student, batches] = await Promise.all([
    studentId
      ? User.findOne({ _id: studentId, role: "student" })
          .select("name username batches")
          .populate("batches", "name level")
          .lean()
      : Promise.resolve(null),
    Batch.find({ isActive: { $ne: false } })
      .select("name level capacity students")
      .sort({ name: 1 })
      .lean(),
  ]);

  return NextResponse.json({
    student,
    batches: (batches as any[]).map((batch) => ({
      _id: batch._id,
      name: batch.name,
      level: batch.level || "",
      capacity: batch.capacity ?? 8,
      studentCount: (batch.students || []).length,
    })),
  });
}

export async function POST(req: Request) {
  const session = await requireTransferAccess();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();

  const body = await req.json().catch(() => ({}));
  const user = session.user as any;
  try {
    const result = await transferStudentBatch({
      studentId: String(body.student || ""),
      fromBatchId: body.fromBatch ? String(body.fromBatch) : undefined,
      toBatchId: String(body.toBatch || ""),
      reason: body.reason ? String(body.reason) : undefined,
      actor: { id: String(user.id || ""), name: user.name || "", role: user.role || "" },
    });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not move this student." }, { status: 400 });
  }
}
