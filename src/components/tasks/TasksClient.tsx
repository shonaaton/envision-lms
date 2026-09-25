"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  CircleDot,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  ListChecks,
  Plus,
  RotateCcw,
  Search,
  Send,
  UserRound,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Field, Modal } from "@/components/common/Modal";
import { PageHeader, StatCard } from "@/components/common/PageHeader";

type Person = { _id: string; name: string; email: string } | null;

export type TaskRow = {
  _id: string;
  title: string;
  details: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  priority: "low" | "normal" | "high";
  source: "auto" | "manual";
  kind: string;
  pool: "admins" | "sales" | null;
  assignedTo: Person;
  createdBy: Person;
  completedBy: Person;
  cancelledBy: Person;
  actionHref: string;
  dueAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  completionNotes: string;
  completionAuto: boolean;
  cancelReason: string;
  createdAt: string | null;
};

type Assignee = { _id: string; name: string; email: string; label: string };
type Summary = { pendingCount: number; overdueCount: number; completedThisWeek: number; assignedByMeOpen: number };
type TabKey = "open" | "completed" | "assigned" | "all";

const POOL_LABEL: Record<string, string> = { admins: "Admin team", sales: "Sales team" };

function formatWhen(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function isOpen(task: TaskRow) {
  return task.status === "pending" || task.status === "in_progress";
}

function isOverdue(task: TaskRow) {
  return Boolean(task.dueAt && isOpen(task) && new Date(task.dueAt).getTime() < Date.now());
}

function PriorityChip({ priority }: { priority: TaskRow["priority"] }) {
  if (priority === "normal") return null;
  const tone = priority === "high" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>{priority === "high" ? "High" : "Low"}</span>;
}

function StatusChip({ task }: { task: TaskRow }) {
  if (task.status === "completed") return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700"><CheckCircle2 size={12} />{task.completionAuto ? "Auto-completed" : "Completed"}</span>;
  if (task.status === "cancelled") return <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600"><XCircle size={12} />Cancelled</span>;
  if (isOverdue(task)) return <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700"><AlertTriangle size={12} />Overdue</span>;
  if (task.status === "in_progress") return <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700"><CircleDot size={12} />In progress</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700"><Clock3 size={12} />Pending</span>;
}

function SourceChip({ task }: { task: TaskRow }) {
  return task.source === "manual" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand"><UserRound size={12} />From {task.createdBy?.name || "a colleague"}</span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600"><Bot size={12} />Automatic</span>
  );
}

function ownerLabel(task: TaskRow) {
  if (task.assignedTo) return task.assignedTo.name || task.assignedTo.email || "Assigned";
  return POOL_LABEL[task.pool || "admins"] || "Team";
}

async function patchTask(id: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Could not update the task.");
  return data.task as TaskRow;
}

export default function TasksClient({ canCreate, isAdmin, currentUserId }: { canCreate: boolean; isAdmin: boolean; currentUserId: string }) {
  const [tab, setTab] = useState<TabKey>("open");
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [priority, setPriority] = useState("");
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<TaskRow | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "open", label: "Pending" },
    { key: "completed", label: "Completed" },
    ...(canCreate ? [{ key: "assigned" as TabKey, label: "Assigned by me" }] : []),
    ...(isAdmin ? [{ key: "all" as TabKey, label: "All tasks" }] : []),
  ];

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (tab === "open") params.set("status", "open");
    if (tab === "completed") params.set("status", "completed");
    if (tab === "assigned") {
      params.set("scope", "assigned_by_me");
      params.set("status", "any");
    }
    if (tab === "all") {
      params.set("scope", "all");
      params.set("status", "open");
    }
    if (q) params.set("q", q);
    if (source) params.set("source", source);
    if (priority) params.set("priority", priority);
    const [listResponse, summaryResponse] = await Promise.all([
      fetch(`/api/tasks?${params}`, { cache: "no-store" }),
      fetch("/api/tasks?summary=1", { cache: "no-store" }),
    ]);
    setLoading(false);
    if (!listResponse.ok) {
      toast.error("Could not load tasks.");
      return;
    }
    const data = await listResponse.json();
    setTasks(data.tasks || []);
    setTotal(data.total || 0);
    if (summaryResponse.ok) setSummary(await summaryResponse.json());
  }, [priority, q, source, tab]);

  useEffect(() => {
    const timer = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  // Deep link from a notification: /tasks?id=<taskId>
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) setDetailId(id);
  }, []);

  function closeDetail() {
    setDetailId(null);
    const url = new URL(window.location.href);
    if (url.searchParams.has("id")) {
      url.searchParams.delete("id");
      window.history.replaceState(null, "", url.toString());
    }
  }

  async function quickStart(task: TaskRow) {
    try {
      await patchTask(task._id, { action: "start" });
      toast.success("Marked in progress.");
      load();
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  return (
    <div className="min-w-0 space-y-4 text-slate-950">
      <PageHeader
        eyebrow="Tasks"
        icon={ListChecks}
        title="Task Manager"
        subtitle="Everything waiting on you: tasks the academy raises automatically (demos, attendance, reviews, payments) and tasks colleagues assign to you. Automatic tasks close themselves once the work is done."
      >
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <StatCard label="Pending" value={summary?.pendingCount ?? "–"} icon={ClipboardList} tone="amber" />
          <StatCard label="Overdue" value={summary?.overdueCount ?? "–"} icon={AlertTriangle} tone="rose" />
          <StatCard label="Done this week" value={summary?.completedThisWeek ?? "–"} icon={ClipboardCheck} tone="green" />
          {canCreate ? <StatCard label="Assigned by me, open" value={summary?.assignedByMeOpen ?? "–"} icon={Send} tone="purple" /> : null}
        </div>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex max-w-full overflow-x-auto rounded-xl border border-brand/10 bg-white p-1 shadow-sm">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-bold transition ${tab === item.key ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-[180px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input !pl-9" placeholder="Search tasks" value={q} onChange={(event) => setQ(event.target.value)} />
        </div>
        <select className="input w-auto" value={source} onChange={(event) => setSource(event.target.value)} aria-label="Source">
          <option value="">All sources</option>
          <option value="auto">Automatic</option>
          <option value="manual">Assigned by people</option>
        </select>
        <select className="input w-auto" value={priority} onChange={(event) => setPriority(event.target.value)} aria-label="Priority">
          <option value="">Any priority</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
        {canCreate && (
          <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            Assign a task
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand/10 bg-white shadow-xl shadow-brand/5">
        {loading && <p className="px-4 py-10 text-center text-sm text-slate-500">Loading tasks…</p>}
        {!loading && !tasks.length && (
          <div className="px-4 py-12 text-center">
            <ClipboardCheck size={28} className="mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-bold text-slate-700">{tab === "open" ? "Nothing pending — you're all caught up." : "No tasks here yet."}</p>
          </div>
        )}
        {!loading && tasks.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {tasks.map((task) => (
              <li key={task._id} className="flex flex-col gap-3 px-4 py-3 hover:bg-slate-50/70 sm:flex-row sm:items-center">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDetailId(task._id)}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusChip task={task} />
                    <PriorityChip priority={task.priority} />
                    <SourceChip task={task} />
                  </div>
                  <div className="mt-1 break-words font-bold text-slate-950">{task.title}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                    <span>Owner: {ownerLabel(task)}</span>
                    {task.dueAt && <span className={isOverdue(task) ? "font-bold text-rose-600" : ""}>Due {formatWhen(task.dueAt)}</span>}
                    {task.completedAt && <span>Done {formatWhen(task.completedAt)}{task.completedBy?.name ? ` by ${task.completedBy.name}` : ""}</span>}
                    {!task.completedAt && task.createdAt && <span>Raised {formatWhen(task.createdAt)}</span>}
                  </div>
                </button>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {task.actionHref && (
                    <a href={task.actionHref} className="btn btn-outline px-3 py-1.5 text-xs">
                      Open <ArrowUpRight size={14} />
                    </a>
                  )}
                  {task.status === "pending" && (
                    <button type="button" className="btn btn-ghost px-3 py-1.5 text-xs" onClick={() => quickStart(task)}>
                      Start
                    </button>
                  )}
                  {isOpen(task) && (
                    <button type="button" className="btn btn-primary px-3 py-1.5 text-xs" onClick={() => setCompleteTarget(task)}>
                      <CheckCircle2 size={14} /> Complete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {!loading && total > tasks.length && (
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">Showing {tasks.length} of {total}. Narrow the search to find older tasks.</p>
        )}
      </div>

      {createOpen && (
        <CreateTaskModal
          currentUserId={currentUserId}
          onClose={() => setCreateOpen(false)}
          onDone={() => {
            setCreateOpen(false);
            load();
          }}
        />
      )}
      {completeTarget && (
        <CompleteTaskModal
          task={completeTarget}
          onClose={() => setCompleteTarget(null)}
          onDone={() => {
            setCompleteTarget(null);
            load();
          }}
        />
      )}
      {detailId && (
        <TaskDetailModal
          taskId={detailId}
          canCreate={canCreate}
          currentUserId={currentUserId}
          onClose={closeDetail}
          onComplete={(task) => {
            closeDetail();
            setCompleteTarget(task);
          }}
          onChanged={load}
        />
      )}
    </div>
  );
}

function useAssignees(enabled = true) {
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  useEffect(() => {
    if (!enabled) return;
    fetch("/api/tasks/assignees", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { assignees: [] }))
      .then((data) => setAssignees(data.assignees || []))
      .catch(() => setAssignees([]));
  }, [enabled]);
  return assignees;
}

function CreateTaskModal({ currentUserId, onClose, onDone }: { currentUserId: string; onClose: () => void; onDone: () => void }) {
  const assignees = useAssignees();
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [priority, setPriority] = useState("normal");
  const [dueAt, setDueAt] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!assignedTo) return toast.error("Choose who should do this.");
    setSaving(true);
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, details, assignedTo, priority, dueAt: dueAt ? new Date(dueAt).toISOString() : null }),
    });
    const data = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) return toast.error(data.error || "Could not assign the task.");
    toast.success("Task assigned. They've been notified.");
    onDone();
  }

  return (
    <Modal title="Assign a task" subtitle="The assignee gets a notification and an email, and you'll hear back with their notes when it's done." onClose={onClose}>
      <form className="space-y-3" onSubmit={submit}>
        <Field label="Task">
          <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required placeholder="e.g. Call back Riya's parent about the weekend batch" />
        </Field>
        <Field label="Details" hint="Optional. Context, links, what 'done' looks like.">
          <textarea className="input min-h-[96px]" value={details} onChange={(event) => setDetails(event.target.value)} maxLength={4000} />
        </Field>
        <Field label="Assign to">
          <select className="input" value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} required>
            <option value="">Choose a person…</option>
            {assignees.map((person) => (
              <option key={person._id} value={person._id}>
                {person.name}{person._id === currentUserId ? " (me)" : ""} — {person.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Priority">
            <select className="input" value={priority} onChange={(event) => setPriority(event.target.value)}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </Field>
          <Field label="Due" hint="Optional. Overdue tasks trigger a reminder.">
            <input className="input" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Assigning…" : "Assign task"}</button>
        </div>
      </form>
    </Modal>
  );
}

function CompleteTaskModal({ task, onClose, onDone }: { task: TaskRow; onClose: () => void; onDone: () => void }) {
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const notesRequired = task.source === "manual";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await patchTask(task._id, { action: "complete", notes });
      toast.success(notesRequired ? `Done. ${task.createdBy?.name || "The assigner"} has been told.` : "Task completed.");
      onDone();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Complete task" subtitle={task.title} onClose={onClose}>
      <form className="space-y-3" onSubmit={submit}>
        <Field label={notesRequired ? "What was done" : "Notes (optional)"} hint={notesRequired ? `${task.createdBy?.name || "The assigner"} will receive these notes.` : undefined}>
          <textarea className="input min-h-[110px]" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} required={notesRequired} autoFocus />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Mark complete"}</button>
        </div>
      </form>
    </Modal>
  );
}

function TaskDetailModal({
  taskId,
  canCreate,
  currentUserId,
  onClose,
  onComplete,
  onChanged,
}: {
  taskId: string;
  canCreate: boolean;
  currentUserId: string;
  onClose: () => void;
  onComplete: (task: TaskRow) => void;
  onChanged: () => void;
}) {
  const [task, setTask] = useState<TaskRow | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState("");
  const [reassignTo, setReassignTo] = useState("");
  const [busy, setBusy] = useState(false);
  const assignees = useAssignees(canCreate);

  useEffect(() => {
    fetch(`/api/tasks/${taskId}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Task not found.");
        setTask(data.task);
        setCanManage(Boolean(data.canManage));
      })
      .catch((err) => setError(err.message));
  }, [taskId]);

  async function act(body: Record<string, unknown>, success: string) {
    if (!task) return;
    setBusy(true);
    try {
      const updated = await patchTask(task._id, body);
      setTask(updated);
      toast.success(success);
      onChanged();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <Modal title="Task" onClose={onClose}>
        <p className="text-sm text-slate-600">{error}</p>
      </Modal>
    );
  }
  if (!task) {
    return (
      <Modal title="Task" onClose={onClose}>
        <p className="text-sm text-slate-500">Loading…</p>
      </Modal>
    );
  }

  const open = isOpen(task);
  const timeline = [
    task.createdAt && { label: task.source === "manual" ? `Assigned by ${task.createdBy?.name || "a colleague"}` : "Raised automatically", when: task.createdAt },
    task.dueAt && { label: "Due", when: task.dueAt },
    task.completedAt && { label: task.completionAuto ? "Completed automatically" : `Completed by ${task.completedBy?.name || "someone"}`, when: task.completedAt },
    task.cancelledAt && { label: `Cancelled${task.cancelledBy?.name ? ` by ${task.cancelledBy.name}` : ""}`, when: task.cancelledAt },
  ].filter(Boolean) as Array<{ label: string; when: string }>;

  return (
    <Modal title={task.title} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusChip task={task} />
          <PriorityChip priority={task.priority} />
          <SourceChip task={task} />
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">Owner: {ownerLabel(task)}</span>
        </div>
        {task.details && <p className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-700">{task.details}</p>}

        <ol className="space-y-1 border-l-2 border-brand/15 pl-3 text-xs text-slate-600">
          {timeline.map((item) => (
            <li key={item.label}><span className="font-bold text-slate-800">{item.label}</span> · {formatWhen(item.when)}</li>
          ))}
        </ol>

        {task.completionNotes && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-700">Completion notes</div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{task.completionNotes}</p>
          </div>
        )}
        {task.cancelReason && <p className="text-xs text-slate-600">Cancel reason: {task.cancelReason}</p>}

        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {task.actionHref && (
            <a href={task.actionHref} className="btn btn-outline">
              Open related page <ArrowUpRight size={15} />
            </a>
          )}
          {open && (
            <button type="button" className="btn btn-primary" onClick={() => onComplete(task)} disabled={busy}>
              <CheckCircle2 size={16} /> Complete
            </button>
          )}
          {open && canManage && (
            <button
              type="button"
              className="btn btn-ghost text-rose-700"
              disabled={busy}
              onClick={() => {
                const reason = window.prompt("Cancel this task? The assignee will be told.\n\nReason (optional):");
                if (reason !== null) act({ action: "cancel", reason }, "Task cancelled.");
              }}
            >
              <XCircle size={16} /> Cancel task
            </button>
          )}
          {!open && canManage && (
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => act({ action: "reopen" }, "Task reopened.")}>
              <RotateCcw size={16} /> Reopen
            </button>
          )}
        </div>

        {open && canCreate && (canManage || task.assignedTo?._id === currentUserId) && assignees.length > 0 && (
          <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
            <div className="min-w-[200px] flex-1">
              <Field label="Reassign to">
                <select className="input" value={reassignTo} onChange={(event) => setReassignTo(event.target.value)}>
                  <option value="">Choose a person…</option>
                  {assignees.map((person) => (
                    <option key={person._id} value={person._id}>{person.name} — {person.label}</option>
                  ))}
                </select>
              </Field>
            </div>
            <button type="button" className="btn btn-outline" disabled={!reassignTo || busy} onClick={() => act({ action: "reassign", assignedTo: reassignTo }, "Task reassigned.")}>
              Reassign
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
