import { auth } from "@/lib/auth";
import { canAccessFeature } from "@/lib/featureAccess";
import { WhatsAppConversation } from "@/models/WhatsAppConversation";

export async function whatsappSession(permission = "view") {
  const session = await auth();
  const user = session?.user as any;
  if (!user || user.isActive === false || user.isPaused === true || user.branch || !["admin", "sub-admin", "instructor"].includes(user.role) || !(await canAccessFeature("whatsapp", user, permission))) return null;
  return { ...user, id: String(user.id) };
}
export function whatsappConversationScope(user: { id: string; role: string }) {
  return user.role === "instructor" ? { assignedTo: user.id } : {};
}
export async function canAccessWhatsAppPhone(user: { id: string; role: string }, phoneNumber: string) {
  return user.role !== "instructor" || Boolean(await WhatsAppConversation.exists({ phoneNumber, assignedTo: user.id }));
}
