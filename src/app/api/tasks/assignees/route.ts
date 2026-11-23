import { dbConnect } from "@/lib/db";
import { User } from "@/models/User";
import { InternalTask } from "@/models/InternalTask";
import { isTaskAdmin } from "@/lib/tasks/taskRules";
import { taskActorFromSession } from "@/lib/tasks/taskAccess";
import { NextResponse } from "next/server";

import { requireTaskAccess } from "@/lib/tasks/taskAccess";
import { manualAssigneeOptions } from "@/lib/tasks/taskRecipients";

export const dynamic = "force-dynamic";

/** Staff a task can be handed to. `/api/admin/users` is admin-only, so sales and sub-admins need this. */
export async function GET(req: Request) {
  const session = await requireTaskAccess("view");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (new URL(req.url).searchParams.get("owners") === "1") {
    if (!isTaskAdmin(taskActorFromSession(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await dbConnect();
    const ownerIds = await InternalTask.distinct("assignedTo", { assignedTo: { $ne: null } });
    const users = await User.find({ $or: [{ _id: { $in: ownerIds } }, { role: { $in: ["admin", "sub-admin", "instructor"] } }] }).select("name email role").sort({ name: 1 }).lean();
    return NextResponse.json({ assignees: users.map((user: any) => ({ _id: String(user._id), name: user.name || user.email, email: user.email || "", label: user.role })) });
  }
  return NextResponse.json({ assignees: await manualAssigneeOptions() });
}
