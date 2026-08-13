import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Course } from "@/models/Course";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || (role !== "instructor" && role !== "admin" && role !== "sub-admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await dbConnect();
  const courses = await Course.find({ isActive: { $ne: false } })
    .select("name category level levels")
    .sort({ name: 1 })
    .limit(300)
    .lean();
  return NextResponse.json({ courses });
}
