import { redirect } from "next/navigation";

import TasksClient from "@/components/tasks/TasksClient";
import { requireTaskAccess, taskActorFromSession } from "@/lib/tasks/taskAccess";
import { isTaskAdmin } from "@/lib/tasks/taskRules";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const session = await requireTaskAccess("view");
  if (!session) redirect("/dashboard?restricted=1");
  const canCreate = Boolean(await requireTaskAccess("create"));
  const actor = taskActorFromSession(session);
  return <TasksClient canCreate={canCreate} isAdmin={isTaskAdmin(actor)} currentUserId={actor.id} />;
}
