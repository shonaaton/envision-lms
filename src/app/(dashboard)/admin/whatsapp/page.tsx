import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import WhatsAppWorkspace from "@/components/admin/WhatsAppWorkspace";

export const dynamic = "force-dynamic";

export default async function AdminWhatsAppPage() {
  const session = await auth();
  if (!["admin", "sub-admin"].includes(String((session?.user as any)?.role || ""))) redirect("/dashboard");
  return <WhatsAppWorkspace />;
}
