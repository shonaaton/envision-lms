import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessFeature, isSuperAdminSession } from "@/lib/featureAccess";
import { isCareersAudience } from "@/lib/careers/careersReviewerIds";

/**
 * Careers is for admins and the named reviewers, Sayan Bose and Dhritabrata
 * Kundu (lib/careers/careersPeople.ts) - every other sub-admin is refused even
 * if Feature Access would let them in. Admins go through the `careers` feature
 * key; the reviewers hold every Careers permission by identity, like the Class
 * Monitor reviewers. Creating a staff (sub-admin) login on Hire still needs a
 * Super Admin.
 */
export type CareersActor = { id: string; name: string; isSuperAdmin: boolean };

export async function getCareersActor(permission = "view"): Promise<CareersActor | null> {
  const session = await auth();
  const user = session?.user as any;
  if (!user?.id || !isCareersAudience(user)) return null;
  if (user.role === "admin" && !(await canAccessFeature("careers", user, permission))) return null;
  return { id: String(user.id), name: String(user.name || "Admin"), isSuperAdmin: await isSuperAdminSession(user) };
}

export const forbidden = () => NextResponse.json({ error: "Only admins and the careers reviewers can manage careers." }, { status: 403 });

/** A user-facing message from a thrown ZodError or Error. */
export function errorMessage(error: unknown, fallback = "Something went wrong.") {
  const issues = (error as any)?.issues;
  if (Array.isArray(issues) && issues.length) return String(issues[0]?.message || fallback);
  return error instanceof Error && error.message ? error.message : fallback;
}
