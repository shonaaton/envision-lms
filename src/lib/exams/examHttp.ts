import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdminApiAccess } from "@/lib/adminApiAccess";
import { canAccessFeature } from "@/lib/featureAccess";
import { ExamError } from "./examService";

export const EXAMS_FEATURE_KEY = "exams";

const ROLES = ["student", "instructor", "admin", "sub-admin"];

/** Anyone who may open the Exam Center: students sit exams, coaches and staff see results. */
export async function requireExamViewer() {
  const session = await auth();
  const user = session?.user as any;
  if (!user || !ROLES.includes(user.role)) return null;
  if (!(await canAccessFeature(EXAMS_FEATURE_KEY, user, "view"))) return null;
  return { id: String(user.id || ""), role: String(user.role) };
}

/** Admins and sub-admins on the admin Exams page (feature `examsAdmin`). */
export async function requireExamAdmin(req: Request, permission: "view" | "edit" | "assign") {
  const session = await requireAdminApiAccess(req, permission);
  const user = session?.user as any;
  if (!user) return null;
  return { id: String(user.id || ""), role: String(user.role) };
}

export function examErrorResponse(error: unknown) {
  if (error instanceof ExamError) return NextResponse.json({ error: error.message, code: error.code || undefined }, { status: error.status });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  if ((error as any)?.name === "CastError") return NextResponse.json({ error: "Not found." }, { status: 404 });
  console.error("Exam request failed", error);
  return NextResponse.json({ error: "Could not process the exam request." }, { status: 500 });
}

export const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });
