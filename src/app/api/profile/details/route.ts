import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { User } from "@/models/User";
import { recordActivity } from "@/lib/activity";
import { needsStudentDetails, parseStudentDetails } from "@/lib/studentDetails";

export const dynamic = "force-dynamic";

const SOURCE_FIELDS = "role accountStatus branch name firstName lastName age parentName parentEmail city country countryCode";

/**
 * The one-time "complete your details" form a student sees at sign-in.
 *
 * Only open while the record is incomplete: once it is filled, name, age and
 * parent are the academy's to change from the admin directory, as before.
 * A parent name or email the academy already holds is never overwritten here.
 */
export async function POST(request: Request) {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  await dbConnect();
  const current: any = await User.findById(userId).select(SOURCE_FIELDS).lean();
  if (!current) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  if (!needsStudentDetails(current)) return NextResponse.json({ error: "Your details are already complete. Ask the academy to change them." }, { status: 409 });

  const parsed = parseStudentDetails((await request.json().catch(() => ({}))) || {});
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { parentName, parentEmail, ...rest } = parsed.update;
  const set: Record<string, unknown> = { ...rest, detailsConfirmedAt: new Date() };
  if (parentName && !current.parentName?.trim()) set.parentName = parentName;
  if (parentEmail && !current.parentEmail?.trim()) set.parentEmail = parentEmail;
  if (rest.age !== current.age) set.ageUpdatedAt = new Date();

  await User.updateOne({ _id: userId }, { $set: set }, { runValidators: true });
  await recordActivity({
    actor: userId,
    targetUser: userId,
    type: "profile.updated",
    label: "Completed student details",
    entityType: "User",
    entityId: userId,
    metadata: { fields: Object.keys(set), source: "details_prompt", previousName: current.name },
  });
  return NextResponse.json({ ok: true, name: rest.name });
}
