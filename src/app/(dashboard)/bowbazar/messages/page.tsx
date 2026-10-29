import MessagesClient from "@/components/bowbazar/MessagesClient";
import { requireBranchPage } from "@/lib/branch/page";

export const dynamic = "force-dynamic";

export default async function BowbazarMessagesPage() {
  const { can } = await requireBranchPage("messages");
  return <MessagesClient can={can} />;
}
