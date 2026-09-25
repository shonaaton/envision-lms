import { NextResponse } from "next/server";

import { requireTaskAccess } from "@/lib/tasks/taskAccess";
import { manualAssigneeOptions } from "@/lib/tasks/taskRecipients";

export const dynamic = "force-dynamic";

/** Staff a task can be handed to. `/api/admin/users` is admin-only, so sales and sub-admins need this. */
export async function GET() {
  const session = await requireTaskAccess("view");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ assignees: await manualAssigneeOptions() });
}
