import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { User } from "@/models/User";
import { Batch } from "@/models/Batch";
import { Course } from "@/models/Course";
import { canAccessFeature } from "@/lib/featureAccess";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const permissionResults = session ? await Promise.all(
    ["create", "edit", "assign"].map((permission) => canAccessFeature("classrooms", session.user as any, permission))
  ) : [];
  const canManageTargets = permissionResults.some(Boolean);
  if (!session || !canManageTargets) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const role = (session.user as any).role;
  if (!["admin", "sub-admin", "instructor"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const coachFilter = role === "instructor" && !permissionResults[2]
    ? { _id: (session.user as any).id, role: "instructor", isActive: { $ne: false } }
    : { role: "instructor", isActive: true };

  const [students, coaches, batches, courses] = await Promise.all([
    User.find({ role: "student", isActive: true }, { name: 1, email: 1, username: 1, batches: 1 }).sort({ name: 1 }).lean(),
    User.find(coachFilter, { name: 1, email: 1, username: 1 }).sort({ name: 1 }).lean(),
    Batch.find({ isActive: true }, { name: 1, students: 1, level: 1 }).populate("students", "name email username isActive").sort({ name: 1 }).lean(),
    Course.find({ isActive: true }, { name: 1, level: 1, category: 1, levels: 1 }).sort({ name: 1 }).lean(),
  ]);

  return NextResponse.json({ students, coaches, batches, courses });
}
