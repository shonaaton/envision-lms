import "server-only";
import { NextResponse } from "next/server";
import { requireAdminApiAccess } from "@/lib/adminApiAccess";
import { HolidayError } from "./holidayService";

/**
 * Admins and the built-in Sub Admins who run the academy. Sales and marketing
 * staff are sub-admins too, told apart by a named access role, and a holiday
 * moves every class in the academy - so they are kept out even if their role
 * is ever granted the feature by mistake.
 */
export async function requireHolidayAccess(req: Request, permission: string) {
  const session = await requireAdminApiAccess(req, permission);
  const user = session?.user as any;
  if (!user) return null;
  if (user.role === "admin") return session;
  if (user.role === "sub-admin" && !user.accessRoleId) return session;
  return null;
}

export function holidayErrorResponse(error: unknown) {
  if (error instanceof HolidayError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  console.error("Holiday request failed", error);
  return NextResponse.json({ error: "Could not process the holiday." }, { status: 500 });
}

export const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });
