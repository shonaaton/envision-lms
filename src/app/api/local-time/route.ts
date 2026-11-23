import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { canAccessFeature } from "@/lib/featureAccess";
import { isValidTimeZone, resolveStudentTimeZone } from "@/lib/localTime/studentTimeZone";
import { ContactMessage } from "@/models/ContactMessage";
import { User } from "@/models/User";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  target: z.enum(["user", "lead"]),
  id: z.string().refine((value) => Types.ObjectId.isValid(value), "Unknown record"),
  /** "" clears a staff-set zone. */
  timeZone: z.string().max(64),
});

const FIELDS = "phone phoneCanonical countryCode city state country timeZone timeZoneSeenAt staffTimeZone staffTimeZoneAt staffTimeZoneByName";

/**
 * Staff set a family's exact timezone after asking them, from the local-time
 * badge. A student's zone goes on every account behind the same phone, so
 * siblings show the same clock.
 */
export async function POST(req: Request) {
  const session = await auth();
  const user = session?.user as any;
  if (!user?.id) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a time zone." }, { status: 400 });
  const { target, id, timeZone } = parsed.data;
  if (timeZone && !isValidTimeZone(timeZone)) return NextResponse.json({ error: "That is not a time zone." }, { status: 400 });

  const allowed =
    target === "lead"
      ? await canAccessFeature("contactEnquiries", user, "view")
      : (await canAccessFeature("retention", user, "view")) || (await canAccessFeature("salesDirectory", user, "view")) || ["admin", "sub-admin"].includes(String(user.role));
  if (!allowed) return NextResponse.json({ error: "You cannot change this." }, { status: 403 });

  await dbConnect();
  const update = timeZone
    ? { $set: { staffTimeZone: timeZone, staffTimeZoneAt: new Date(), staffTimeZoneByName: String(user.name || user.email || "Staff") } }
    : { $unset: { staffTimeZone: 1, staffTimeZoneAt: 1, staffTimeZoneByName: 1 } };

  if (target === "lead") {
    const lead: any = await ContactMessage.findByIdAndUpdate(id, update, { new: true }).select(`${FIELDS} createdAt`).lean();
    if (!lead) return NextResponse.json({ error: "That lead is gone." }, { status: 404 });
    return NextResponse.json({ localTime: resolveStudentTimeZone({ ...lead, timeZoneSeenAt: lead.createdAt }) });
  }

  const person: any = await User.findById(id).select(FIELDS).lean();
  if (!person) return NextResponse.json({ error: "That account is gone." }, { status: 404 });
  const family = person.phoneCanonical ? { $or: [{ _id: person._id }, { role: "student", phoneCanonical: person.phoneCanonical }] } : { _id: person._id };
  await User.updateMany(family, update);
  const fresh: any = await User.findById(id).select(FIELDS).lean();
  return NextResponse.json({ localTime: resolveStudentTimeZone(fresh) });
}
