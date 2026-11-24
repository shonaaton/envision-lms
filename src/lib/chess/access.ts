import "server-only";

import { Types } from "mongoose";
import { auth } from "@/lib/auth";
import { canAccessFeature, type SessionUser } from "@/lib/featureAccess";
import { getCoachAssignedStudentIds } from "@/lib/coachStudentAccess";
import { User } from "@/models/User";
import { decideChessAccess, type ChessAccessScope } from "./accessDecision";

/** What a student does on their own chess profile: see it, link accounts, sync, open games. */
const OWN_PROFILE_PERMISSIONS = ["view", "manage_accounts", "sync", "games"];

/**
 * Player Analytics access for this user. An offline-branch (Bowbazar) student
 * always has their own chess profile: the branch has no say in the online
 * academy's Feature Access roles or pilot cohorts, so leaving it to those
 * bounced every branch student back to their class page. Everyone else goes
 * through Feature Access as before.
 */
export async function canUseChessProfile(user: SessionUser | null | undefined, permission = "view") {
  if (!user) return false;
  const branch = (user as SessionUser & { branch?: string }).branch;
  if (user.role === "student" && branch && OWN_PROFILE_PERMISSIONS.includes(permission)) return true;
  return canAccessFeature("playerAnalytics", user, permission);
}

export async function requireChessSession(permission = "view") {
  const session = await auth();
  if (!session?.user) return null;
  const allowed = await canUseChessProfile(session.user as SessionUser, permission);
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
