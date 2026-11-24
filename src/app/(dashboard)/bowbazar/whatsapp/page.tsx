import WhatsAppClient from "@/components/bowbazar/WhatsAppClient";
import { requireBranchPage } from "@/lib/branch/page";

export const dynamic = "force-dynamic";

export default async function BowbazarWhatsAppPage() {
  const { can, userId } = await requireBranchPage("whatsapp");
  return <WhatsAppClient can={can} actorId={userId} />;
}
