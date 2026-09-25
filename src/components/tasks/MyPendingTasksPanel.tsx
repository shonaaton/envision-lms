import Link from "next/link";
import { AlertTriangle, ArrowRight, Bot, ListChecks, UserRound } from "lucide-react";

import { formatAcademyDateTime } from "@/lib/academyTime";
import { requireTaskAccess, taskActorFromSession } from "@/lib/tasks/taskAccess";
import { isOverdue } from "@/lib/tasks/taskRules";
import { listTasks, taskSummary } from "@/lib/tasks/taskService";

/** Top open tasks for the signed-in staff member, for the dashboard. Renders nothing when they have none. */
export default async function MyPendingTasksPanel({ limit = 5 }: { limit?: number }) {
  const session = await requireTaskAccess("view").catch(() => null);
  if (!session) return null;
  const actor = taskActorFromSession(session);
  if (!actor.id) return null;
  const [list, summary] = await Promise.all([
    listTasks(actor, { scope: "mine", status: "open", limit }).catch(() => null),
    taskSummary(actor).catch(() => null),
  ]);
  if (!list || !list.tasks.length) return null;

  return (
    <section className="rounded-xl border border-brand/10 bg-white p-4 shadow-sm shadow-brand/5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand/10 text-brand"><ListChecks size={16} /></span>
          <div>
            <h2 className="text-sm font-black text-slate-950">My pending tasks</h2>
            <p className="text-xs text-slate-500">
              {summary?.pendingCount ?? list.total} open{summary?.overdueCount ? ` · ${summary.overdueCount} overdue` : ""}
            </p>
          </div>
        </div>
        <Link href="/tasks" className="inline-flex items-center gap-1 text-xs font-bold text-brand hover:underline">
          View all <ArrowRight size={14} />
        </Link>
      </div>
      <ul className="divide-y divide-slate-100">
        {list.tasks.map((task) => {
          const overdue = isOverdue(task);
          return (
            <li key={task._id}>
              <Link href={`/tasks?id=${task._id}`} className="flex items-start gap-2 py-2 hover:bg-slate-50/70">
                <span className="mt-0.5 text-slate-400">{task.source === "manual" ? <UserRound size={14} /> : <Bot size={14} />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-bold text-slate-900">{task.title}</span>
                  <span className="block text-xs text-slate-500">
                    {task.source === "manual" ? `From ${task.createdBy?.name || "a colleague"}` : "Automatic"}
                    {task.dueAt ? ` · due ${formatAcademyDateTime(task.dueAt)}` : ""}
                  </span>
                </span>
                {overdue && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700"><AlertTriangle size={11} />Overdue</span>}
                {!overdue && task.priority === "high" && <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">High</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
