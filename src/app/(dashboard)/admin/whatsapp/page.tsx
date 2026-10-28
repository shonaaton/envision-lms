import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import WhatsAppWorkspace from "@/components/admin/WhatsAppWorkspace";
import { canAccessFeature } from "@/lib/featureAccess";

export const dynamic = "force-dynamic";

export default async function AdminWhatsAppPage() {
  const session = await auth();
  if (!["admin", "sub-admin", "instructor"].includes(String((session?.user as any)?.role || ""))) redirect("/dashboard");
  const canManage = (session!.user as any).role !== "instructor" && await canAccessFeature("whatsapp", session!.user as any, "manage");
  return <WhatsAppWorkspace actorId={String((session!.user as any).id)} role={(session!.user as any).role} canManage={canManage} />;
}
