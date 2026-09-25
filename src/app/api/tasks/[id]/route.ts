import { NextResponse } from "next/server";

import { requireTaskAccess, taskActorFromSession } from "@/lib/tasks/taskAccess";
import { canManageTask, taskActionSchema } from "@/lib/tasks/taskRules";
import { TaskError, applyTaskAction, getTaskForActor, serializeTask } from "@/lib/tasks/taskService";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof TaskError) return NextResponse.json({ error: error.message }, { status: error.status });
  const issues = (error as any)?.issues;
  if (Array.isArray(issues) && issues[0]?.message) return NextResponse.json({ error: issues[0].message }, { status: 400 });
  console.error("Task request failed", error);
  return NextResponse.json({ error: "Could not process the task request." }, { status: 500 });
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await requireTaskAccess("view");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { task, access } = await getTaskForActor(params.id, taskActorFromSession(session));
    return NextResponse.json({ task: serializeTask(task), canManage: canManageTask(task, access) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await requireTaskAccess("edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const input = taskActionSchema.parse(await req.json().catch(() => ({})));
    const task = await applyTaskAction(params.id, input, taskActorFromSession(session));
    return NextResponse.json({ task });
  } catch (error) {
    return errorResponse(error);
  }
}
