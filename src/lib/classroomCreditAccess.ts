import { FeeAssignment } from "@/models/Fee";

/**
 * Single authoritative rule for whether a student may enter a classroom
 * based on their class-credit balance.
 *
 * Business rule: positive credits -> 0 -> -1 -> blocked.
 *   balance  > 0   normal join.
 *   balance == 0   the student's FINAL grace class. They may still join, but
 *                  only after explicitly confirming a warning.
 *   balance <= -1  blocked until they recharge.
 *
 * This applies ONLY to students on a credit-based fee plan. Plan type comes
 * from `FeeAssignment.type` (the authoritative enum on the assignment) and is
 * never inferred from the presence of a balance, so monthly/unlimited
 * students are never gated here regardless of any legacy credit fields.
 *
 * Both the client experience (join button) and the server-side classroom
 * entry checks read this same function, so they can never disagree.
 */

export type ClassroomCreditState = "ok" | "final_class" | "blocked";

export type ClassroomCreditEligibility = {
  planType: "credits" | "non_credit";
  balance: number | null;
  state: ClassroomCreditState;
  /** balance === 0: allowed in, but only after confirming the final-class warning. */
  requiresWarning: boolean;
  /** balance <= -1: no route into a classroom until credits are recharged. */
  blocked: boolean;
};

const NOT_CREDIT_GATED: ClassroomCreditEligibility = {
  planType: "non_credit",
  balance: null,
  state: "ok",
  requiresWarning: false,
  blocked: false,
};

/** Balance -> state. Kept pure so the same thresholds are testable in isolation. */
export function evaluateCreditBalance(balance: number): ClassroomCreditState {
  if (balance > 0) return "ok";
  if (balance === 0) return "final_class";
  return "blocked";
}

export async function getClassroomCreditEligibility(
  userId: string | undefined | null,
  role: string | undefined | null
): Promise<ClassroomCreditEligibility> {
  // Coaches, admins and sub-admins are never credit-gated.
  if (!userId || role !== "student") return NOT_CREDIT_GATED;

  const assignment: any = await FeeAssignment.findOne({ student: userId, type: "credits" })
    .select("creditBalance")
    .lean();
  // No credit-type assignment => monthly/unlimited/unassigned => not gated.
  if (!assignment) return NOT_CREDIT_GATED;

  const balance = Number(assignment.creditBalance || 0);
  const state = evaluateCreditBalance(balance);
  return {
    planType: "credits",
    balance,
    state,
    requiresWarning: state === "final_class",
    blocked: state === "blocked",
  };
}
