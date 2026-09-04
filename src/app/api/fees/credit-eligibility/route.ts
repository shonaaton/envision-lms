import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { getClassroomCreditEligibility } from "@/lib/classroomCreditAccess";

export const dynamic = "force-dynamic";

/**
 * Classroom-entry credit eligibility for the signed-in user. The join button
 * reads this so it can decide, before any navigation or window.open, whether
 * to launch straight away, show the final-class warning, or block entry.
 *
 * This is advisory for the UI only — the same rule is enforced server-side in
 * the classroom pages and in getLiveClassroomForUser, so a student cannot get
 * in by skipping the button.
 */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id?: string }).id || "";
  const role = (session.user as { role?: string }).role || "";
  await dbConnect();
  const eligibility = await getClassroomCreditEligibility(userId, role);
  return NextResponse.json(eligibility);
}
