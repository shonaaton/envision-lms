import "server-only";

import { Types } from "mongoose";
import { auth } from "@/lib/auth";
import { canAccessFeature, type SessionUser } from "@/lib/featureAccess";
import { getCoachAssignedStudentIds } from "@/lib/coachStudentAccess";
import { User } from "@/models/User";
import { decideChessAccess, type ChessAccessScope } from "./accessDecision";

export async function requireChessSession(permission = "view") {
  const session = await auth();
  if (!session?.user) return null;
  const allowed = await canAccessFeature("playerAnalytics", session.user as SessionUser, permission);
  return allowed ? session : null;
}

export async function resolveAuthorizedChessStudent(requestedStudentId?: string | null, permission = "view") {
  const session = await requireChessSession(permission);
  if (!session?.user) return null;
  const user = session.user as SessionUser;
  const userId = String(user.id || "");
  const role = user.role;
  const targetStudentId = requestedStudentId || userId;

  if (!Types.ObjectId.isValid(targetStudentId)) return null;

  if (role === "student") {
    const decision = decideChessAccess({ role, userId, requestedStudentId: targetStudentId });
    if (!decision.allowed) return null;
    return { session, studentId: decision.studentId!, scope: decision.scope! };
  }

  if (role === "instructor") {
    const assignedIds = await getCoachAssignedStudentIds(userId);
    const decision = decideChessAccess({ role, userId, requestedStudentId: targetStudentId, assignedStudentIds: assignedIds });
    if (!decision.allowed) return null;
    return { session, studentId: decision.studentId!, scope: decision.scope! };
  }

  if (await canAccessFeature("playerAnalytics", user, "view_all")) {
    const decision = decideChessAccess({ role, userId, requestedStudentId: targetStudentId, canViewAll: true });
    if (!decision.allowed) return null;
    const student = await User.exists({ _id: targetStudentId, role: "student", isActive: { $ne: false } });
    if (!student) return null;
    return { session, studentId: decision.studentId!, scope: decision.scope! };
  }

  return null;
}
