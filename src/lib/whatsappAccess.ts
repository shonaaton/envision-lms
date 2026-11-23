import { auth } from "@/lib/auth";
import { canAccessFeature } from "@/lib/featureAccess";
import { WhatsAppConversation } from "@/models/WhatsAppConversation";
import { branchOnlyInboxNationals, isBranchOnlyInboxNumber, inboxNational } from "@/lib/branch/inboxSeparation";

export async function whatsappSession(permission = "view") {
  const session = await auth();
  const user = session?.user as any;
  if (!user || user.isActive === false || user.isPaused === true || user.branch || !["admin", "sub-admin", "instructor"].includes(user.role) || !(await canAccessFeature("whatsapp", user, permission))) return null;
  return { ...user, id: String(user.id) };
}
export function whatsappConversationScope(user: { id: string; role: string }) {
  return user.role === "instructor" ? { assignedTo: user.id } : {};
}
/** Online inbox access. Bowbazar-only family chats belong to the branch inbox, never this one. */
export async function canAccessWhatsAppPhone(user: { id: string; role: string }, phoneNumber: string) {
  if (await isBranchOnlyInboxNumber(phoneNumber)) return false;
  return user.role !== "instructor" || Boolean(await WhatsAppConversation.exists({ phoneNumber, assignedTo: user.id }));
}
/** Drops Bowbazar-only family chats from an online inbox list. */
export async function withoutBranchChats<T extends { phoneNumber: string }>(rows: T[]) {
  const hidden = await branchOnlyInboxNationals();
  if (!hidden.size) return rows;
  return rows.filter((row) => !hidden.has(inboxNational(row.phoneNumber)));
}
