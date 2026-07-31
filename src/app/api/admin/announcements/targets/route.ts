import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Batch } from "@/models/Batch";
import { User } from "@/models/User";
import { requireAdminApiAccess } from "@/lib/adminApiAccess";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requireAdminApiAccess(req, "view");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await dbConnect();
  const [batches, students, coaches] = await Promise.all([
    Batch.find({ isActive: { $ne: false } }, { name: 1, level: 1, students: 1, coach: 1 }).populate("coach", "name email").sort({ name: 1 }).lean(),
    User.find({ role: "student", isActive: { $ne: false } }, { name: 1, email: 1, username: 1, batches: 1 }).sort({ name: 1 }).limit(1000).lean(),
    User.find({ role: "instructor", isActive: { $ne: false } }, { name: 1, email: 1, username: 1 }).sort({ name: 1 }).limit(500).lean(),
  ]);

  return NextResponse.json({ batches, students, coaches });
}
