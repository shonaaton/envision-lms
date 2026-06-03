import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Availability, Booking } from "@/models/Booking";
import { bookingSchema } from "@/lib/validation";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;
  await dbConnect();
  const list = await Booking.find({ $or: [{ student: userId }, { instructor: userId }] })
    .sort({ startAt: 1 })
    .populate("instructor student", "name email")
    .lean();
  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = bookingSchema.parse(await req.json());
    await dbConnect();
    const overlap = await Booking.findOne({
      instructor: body.instructor,
      startAt: { $lt: new Date(body.endAt) },
      endAt: { $gt: new Date(body.startAt) },
      status: { $in: ["pending", "confirmed"] },
    });
    if (overlap) return NextResponse.json({ error: "Slot already booked" }, { status: 409 });

    const av = await Availability.findOne({ instructor: body.instructor }).lean();
    const created = await Booking.create({
      ...body,
      student: (session.user as any).id,
      startAt: new Date(body.startAt),
      endAt: new Date(body.endAt),
      status: av && (av as any).feePerSession > 0 ? "pending" : "confirmed",
    });
    return NextResponse.json(created);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Bad request" }, { status: 400 });
  }
}
