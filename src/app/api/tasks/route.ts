import { NextResponse } from "next/server";

import { requireTaskAccess, taskActorFromSession } from "@/lib/tasks/taskAccess";
import { taskCreateSchema } from "@/lib/tasks/taskRules";
import { TaskError, createManualTask, listTasks, serializeTask, taskSummary, type TaskListFilter } from "@/lib/tasks/taskService";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof TaskError) return NextResponse.json({ error: error.message }, { status: error.status });
  const issues = (error as any)?.issues;
  if (Array.isArray(issues) && issues[0]?.message) return NextResponse.json({ error: issues[0].message }, { status: 400 });
  console.error("Task request failed", error);
  return NextResponse.json({ error: "Could not process the task request." }, { status: 500 });
}

const SCOPES = ["mine", "assigned_by_me", "all"] as const;
const STATUSES = ["open", "completed", "cancelled", "any"] as const;

export async function GET(req: Request) {
  const session = await requireTaskAccess("view");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actor = taskActorFromSession(session);
  const url = new URL(req.url);
  try {
    if (url.searchParams.get("summary") === "1") return NextResponse.json(await taskSummary(actor));
    const pick = <T extends readonly string[]>(value: string | null, allowed: T) => (allowed.includes(value || "") ? (value as T[number]) : undefined);
    const filter: TaskListFilter = {
      scope: pick(url.searchParams.get("scope"), SCOPES),
      status: pick(url.searchParams.get("status"), STATUSES),
      source: pick(url.searchParams.get("source"), ["auto", "manual"] as const),
      priority: pick(url.searchParams.get("priority"), ["low", "normal", "high"] as const),
      q: url.searchParams.get("q") || undefined,
      page: Number(url.searchParams.get("page")) || 1,
      limit: Number(url.searchParams.get("limit")) || 50,
    };
    return NextResponse.json(await listTasks(actor, filter));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request) {
  const session = await requireTaskAccess("create");
  if (!session) return NextResponse.json({ error: "You cannot assign tasks." }, { status: 403 });
  try {
    const input = taskCreateSchema.parse(await req.json().catch(() => ({})));
    const task = await createManualTask(input, taskActorFromSession(session));
    return NextResponse.json({ task: serializeTask(task) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
