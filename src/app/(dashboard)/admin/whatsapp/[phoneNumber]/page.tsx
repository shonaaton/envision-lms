import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import WhatsAppWorkspace from "@/components/admin/WhatsAppWorkspace";
import { normalizeWhatsAppNumber } from "@/lib/whatsappAutomation";

export const dynamic = "force-dynamic";

export default async function AdminWhatsAppConversationPage({ params }: { params: { phoneNumber: string } }) {
  const session = await auth();
  if (!["admin", "sub-admin"].includes(String((session?.user as any)?.role || ""))) redirect("/dashboard");
  return <WhatsAppWorkspace initialPhoneNumber={normalizeWhatsAppNumber(decodeURIComponent(params.phoneNumber || ""))} />;
}
