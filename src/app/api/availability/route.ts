import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Availability } from "@/models/Booking";

export async function GET(req: Request) {
  await dbConnect();
  const url = new URL(req.url);
  const instructor = url.searchParams.get("instructor");
  if (!instructor) return NextResponse.json({ error: "instructor required" }, { status: 400 });
  const a = await Availability.findOne({ instructor }).lean();
  return NextResponse.json(a || { slots: [], feePerSession: 0 });
}

export async function PUT(req: Request) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || (role !== "instructor" && role !== "admin")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const body = await req.json();
  const doc = await Availability.findOneAndUpdate(
    { instructor: (session.user as any).id },
    body,
    { upsert: true, new: true }
  );
  return NextResponse.json(doc);
}
