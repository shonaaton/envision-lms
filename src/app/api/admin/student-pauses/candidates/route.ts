import { NextResponse } from "next/server";

import { dbConnect } from "@/lib/db";
import { requireStudentPauseAccess } from "@/lib/studentPauseAccess";
import { Batch } from "@/models/Batch";
import { User } from "@/models/User";

export const dynamic = "force-dynamic";

/** Students who can still be paused, plus every batch, for the pause form. */
export async function GET() {
  const session = await requireStudentPauseAccess("manage");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();

  const [students, batches] = await Promise.all([
    User.find({ role: "student", isActive: { $ne: false }, isPaused: { $ne: true }, accountStatus: { $ne: "demo" } })
      .select("name email username batches")
      .populate("batches", "name")
      .sort({ name: 1 })
      .lean(),
    Batch.find({}).select("name isActive").sort({ name: 1 }).lean(),
  ]);

  return NextResponse.json({ students, batches });
}
