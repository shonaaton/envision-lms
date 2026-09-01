import type { SessionUser } from "@/lib/featureAccess";

export type ChessAccessScope = "own" | "assigned" | "all";
export type ChessAccessDecisionInput = {
  role?: SessionUser["role"];
  userId?: string;
  requestedStudentId?: string | null;
  assignedStudentIds?: string[];
  canViewAll?: boolean;
};

export function decideChessAccess(input: ChessAccessDecisionInput): { allowed: boolean; studentId?: string; scope?: ChessAccessScope } {
  const targetStudentId = input.requestedStudentId || input.userId;
  if (!targetStudentId || !input.userId) return { allowed: false };
  if (input.role === "student") {
    return targetStudentId === input.userId ? { allowed: true, studentId: input.userId, scope: "own" } : { allowed: false };
  }
  if (input.role === "instructor") {
    return input.assignedStudentIds?.includes(targetStudentId) ? { allowed: true, studentId: targetStudentId, scope: "assigned" } : { allowed: false };
  }
  if ((input.role === "admin" || input.role === "sub-admin") && input.canViewAll) {
    return { allowed: true, studentId: targetStudentId, scope: "all" };
  }
  return { allowed: false };
}
