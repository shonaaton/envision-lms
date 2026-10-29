import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import type { BranchCapability } from "./rules";
import { resolveBranchAccess } from "./access";
import type { BranchKey } from "./scope";
import { BranchError } from "./service";
import { dbConnect } from "@/lib/db";
import { BranchStudent } from "@/models/Branch";

/** The signed-in staff member and their branch, when they hold `capability` there. */
export async function requireBranchAccess(capability: BranchCapability) {
  const session = await auth();
  const user = session?.user as any;
  if (!user || user.isActive === false) return null;
  const access = await resolveBranchAccess(user);
  if (!access || !access.can.has(capability)) return null;
  return { session: session!, user, branch: access.branch, can: access.can, actorId: String(user.id) };
}

export const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

export function branchErrorResponse(error: unknown) {
  if (error instanceof BranchError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  console.error("Branch request failed", error);
  return NextResponse.json({ error: "Could not complete the request." }, { status: 500 });
}

/** The signed-in branch student and their branch record, for their own pages. */
export async function requireBranchStudent() {
  const session = await auth();
  const user = session?.user as any;
  if (!user || user.role !== "student" || !user.branch || user.isActive === false) return null;
  await dbConnect();
  const student: any = await BranchStudent.findOne({ user: user.id, branch: user.branch }).lean();
  if (!student) return null;
  return { user, student, branch: student.branch as BranchKey, actor: { id: String(user.id), name: String(user.name || ""), staff: false } };
}
