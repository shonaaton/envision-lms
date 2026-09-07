import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { canAccessFeature } from "@/lib/featureAccess";
import { backfillStudentDeactivations } from "@/lib/studentDeactivation";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Catches up the students who were deactivated before deactivation started
 * closing batches. GET reports what is still outstanding; POST applies it.
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
  const result = await backfillStudentDeactivations({ apply: false });
  return NextResponse.json(result);
}

export async function POST() {
  const session = await requireAdmin("manage");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const user = session.user as any;
  const result = await backfillStudentDeactivations({
    apply: true,
    actor: { id: String(user.id || ""), name: String(user.name || ""), role: String(user.role || "") },
  });
  return NextResponse.json(result);
}
