import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Homework } from "@/models/Homework";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  const hw = await Homework.findById(params.id).lean();
  if (!hw) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(hw);
}
