import "server-only";

import { auth } from "@/lib/auth";
import { canAccessFeature } from "@/lib/featureAccess";
import type { FeedbackViewer } from "@/lib/feedback/feedbackRules";

export const FEEDBACK_FEATURE_KEY = "monthlyFeedback";

const ROLES = ["student", "instructor", "admin", "sub-admin"];

/**
 * The signed-in viewer, or null when they may not open monthly feedback at all.
 * `canApprove` is resolved here once so every route and the page agree on it.
 */
export async function requireFeedbackViewer(): Promise<FeedbackViewer | null> {
  const session = await auth();
  const user = session?.user as any;
  if (!user || !ROLES.includes(user.role)) return null;
  if (!(await canAccessFeature(FEEDBACK_FEATURE_KEY, user, "view"))) return null;
  const staff = user.role === "admin" || user.role === "sub-admin";
  const canApprove = staff ? await canAccessFeature(FEEDBACK_FEATURE_KEY, user, "approve") : false;
  const canEdit = user.role === "instructor" ? await canAccessFeature(FEEDBACK_FEATURE_KEY, user, "edit") : false;
  return { id: String(user.id || ""), role: user.role, canApprove, canEdit };
}
