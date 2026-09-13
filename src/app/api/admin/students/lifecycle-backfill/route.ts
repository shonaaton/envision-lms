import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { canAccessFeature } from "@/lib/featureAccess";
import { backfillGroupLifecycle } from "@/lib/groupLifecycle";
import { repairSessionRosterLockouts, syncPausedStudentRosters } from "@/lib/studentPause";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Catches up the students who were deactivated or paused before those actions
 * started closing and pausing batches. GET reports what is still outstanding;
 * POST applies it.
 */
async function requireAdmin(permission: "view" | "manage") {
  const session = await auth();
  if (!session?.user) return null;
  const role = String((session.user as any).role || "");
  if (role !== "admin" && role !== "sub-admin") return null;
  if (!(await canAccessFeature("userManagement", session.user as any, permission))) return null;
  return session;
}

export async function GET() {
  const session = await requireAdmin("view");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const result = await backfillGroupLifecycle({ apply: false });
  const rosterLockouts = await repairSessionRosterLockouts({ apply: false }).catch(() => null);
  return NextResponse.json({ ...result, rosterLockouts });
}

export async function POST() {
  const session = await requireAdmin("manage");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const user = session.user as any;
  const result = await backfillGroupLifecycle({
    apply: true,
    actor: { id: String(user.id || ""), name: String(user.name || ""), role: String(user.role || "") },
  });
  // Pausing a student in a batch that keeps running leaves no group to pause, so
  // the group catch-up never reaches them - but they can still be sitting on the
  // register of classes inside their break. Sweep those rosters as well.
  const rosters = await syncPausedStudentRosters().catch(() => null);
  // Runs after the paused sweep so it reads the rosters that sweep just wrote,
  // and puts back classroom members an earlier reinstatement or classroom edit
  // left off the upcoming classes.
  const rosterLockouts = await repairSessionRosterLockouts({ apply: true }).catch((error) => {
    console.error("Session roster repair failed", error);
    return null;
  });
  return NextResponse.json({ ...result, rosters, rosterLockouts });
}
