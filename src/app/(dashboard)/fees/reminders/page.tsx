import { redirect } from "next/navigation";
import FeeRemindersWorkspace from "@/components/fees/FeeRemindersWorkspace";
import { dbConnect } from "@/lib/db";
import { getFeeReminderWorkspace } from "@/lib/feeReminders";
import { isFeesManager, requireFeesAccess } from "@/lib/feesAccess";

export const dynamic = "force-dynamic";

export default async function FeeRemindersPage() {
  const session = await requireFeesAccess("view", "fees");
  if (!session?.user) redirect("/dashboard");
  if (!isFeesManager(String((session.user as any).role || ""))) redirect("/fees");
  await dbConnect();
  const data = await getFeeReminderWorkspace();
  return <FeeRemindersWorkspace initialData={JSON.parse(JSON.stringify(data))} />;
}
