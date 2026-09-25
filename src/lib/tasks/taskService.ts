import "server-only";

import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import {
  notifyTaskCancelled,
  notifyTaskCompleted,
  notifyTaskCreated,
  notifyTaskReassigned,
} from "@/lib/tasks/taskNotifications";
import { poolsForActor, type TaskActor } from "@/lib/tasks/taskRecipients";
import {
  MANUAL_ASSIGNEE_ROLES,
  OPEN_TASK_STATUSES,
  canActOnTask,
  canManageTask,
  isTaskAdmin,
  type TaskActionInput,
  type TaskCreateInput,
  type TaskPool,
  type TaskPriority,
} from "@/lib/tasks/taskRules";
import { InternalTask } from "@/models/InternalTask";
import { User } from "@/models/User";

export class TaskError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function toObjectId(value: unknown) {
  const raw = String((value as any)?._id ?? value ?? "");
  return Types.ObjectId.isValid(raw) ? new Types.ObjectId(raw) : null;
}

// ---------------------------------------------------------------------------
// Automatic tasks
// ---------------------------------------------------------------------------

export type AutoTaskInput = {
  kind: string;
  referenceType: string;
  referenceId: unknown;
  title: string;
  details?: string;
  assignedTo?: unknown;
  pool?: TaskPool | null;
  priority?: TaskPriority;
  dueAt?: Date | null;
  actionHref?: string;
  metadata?: Record<string, unknown>;
  /** Reopen the task if it was closed and the event happens again. */
  reopenIfClosed?: boolean;
  /**
   * Set false when the caller announces a batch of tasks itself - the monthly
   * feedback sweep raises one task per student and sends each coach a single
   * summary instead of thirty identical alerts.
   */
  notify?: boolean;
};

/**
 * Raise a task for an app event. Idempotent on (referenceType, referenceId):
 * re-raising an open task changes nothing, and a task a person already closed
 * is never silently reopened. Only a brand-new task notifies anyone.
 */
export async function ensureAutoTask(input: AutoTaskInput) {
  const referenceId = toObjectId(input.referenceId);
  if (!referenceId) return null;
  const assignedTo = toObjectId(input.assignedTo);
  await dbConnect();
  const result: any = await InternalTask.findOneAndUpdate(
    { referenceType: input.referenceType, referenceId },
    {
      $setOnInsert: {
        title: input.title.slice(0, 200),
        details: (input.details || "").slice(0, 4000),
        status: "pending",
        priority: input.priority || "normal",
        assignedTo,
        pool: assignedTo ? null : input.pool || "admins",
        source: "auto",
        kind: input.kind,
        referenceType: input.referenceType,
        referenceId,
        actionHref: input.actionHref || "",
        dueAt: input.dueAt || null,
        metadata: input.metadata || {},
      },
    },
    { upsert: true, new: true, includeResultMetadata: true }
  );
  let task = result?.value;
  const inserted = Boolean(result?.lastErrorObject?.upserted);
  if (task && inserted) {
    if (input.notify !== false) await notifyTaskCreated(task).catch(() => undefined);
    return task;
  }
  // A recurring condition (credits ran out again, a lead went quiet again) on a
  // task that was already closed: bring the same task back rather than a twin.
  if (task && input.reopenIfClosed && !OPEN_TASK_STATUSES.includes(task.status)) {
    task = await InternalTask.findOneAndUpdate(
      { _id: task._id, status: task.status },
      {
        $set: {
          status: "pending",
          title: input.title.slice(0, 200),
          details: (input.details || "").slice(0, 4000),
          priority: input.priority || task.priority,
          assignedTo,
          pool: assignedTo ? null : input.pool || "admins",
          dueAt: input.dueAt || null,
          metadata: { ...(task.metadata || {}), ...(input.metadata || {}) },
          completedAt: null,
          completedBy: null,
          completionNotes: "",
          completionAuto: false,
          cancelledAt: null,
          cancelledBy: null,
          cancelReason: "",
          overdueNotifiedAt: null,
        },
      },
      { new: true }
    ).lean();
    if (task && input.notify !== false) await notifyTaskCreated({ ...task, _id: task._id }, undefined, `reopen:${Date.now()}`).catch(() => undefined);
  }
  return task;
}

/** Close an automatic task because the thing it asked for has happened. */
export async function resolveAutoTask(referenceType: string, referenceId: unknown, options: { by?: unknown; note?: string } = {}) {
  const id = toObjectId(referenceId);
  if (!id) return null;
  await dbConnect();
  return InternalTask.findOneAndUpdate(
    { referenceType, referenceId: id, status: { $in: OPEN_TASK_STATUSES } },
    {
      $set: {
        status: "completed",
        completedAt: new Date(),
        completedBy: toObjectId(options.by),
        completionAuto: true,
        completionNotes: options.note || "Completed automatically when the underlying work was done.",
      },
    },
    { new: true }
  ).lean();
}

/**
 * Close every open automatic task of `kind` about one subject (tasks record
 * `metadata.studentId` etc.), for events that settle several records at once
 * — e.g. a new demo booking settles the "rebook" task on every missed demo.
 */
export async function resolveAutoTasksWhere(kind: string, metadataMatch: Record<string, string>, options: { by?: unknown; note?: string } = {}) {
  const entries = Object.entries(metadataMatch).filter(([, value]) => value);
  if (!entries.length) return 0;
  await dbConnect();
  const filter: any = { source: "auto", kind, status: { $in: OPEN_TASK_STATUSES } };
  for (const [key, value] of entries) filter[`metadata.${key}`] = value;
  const result = await InternalTask.updateMany(filter, {
    $set: {
      status: "completed",
      completedAt: new Date(),
      completedBy: toObjectId(options.by),
      completionAuto: true,
      completionNotes: options.note || "Completed automatically when the underlying work was done.",
    },
  });
  return result.modifiedCount || 0;
}

/** Withdraw an automatic task that no longer needs doing (e.g. the lead was closed). */
export async function cancelAutoTask(referenceType: string, referenceId: unknown, reason: string) {
  const id = toObjectId(referenceId);
  if (!id) return null;
  await dbConnect();
  return InternalTask.findOneAndUpdate(
    { referenceType, referenceId: id, status: { $in: OPEN_TASK_STATUSES } },
    { $set: { status: "cancelled", cancelledAt: new Date(), cancelReason: reason } },
    { new: true }
  ).lean();
}

/** Hand every open task of these kinds about `referenceIds` to a new owner. */
export async function reassignAutoTasks(referenceType: string, referenceIds: unknown[], ownerId: unknown) {
  const owner = toObjectId(ownerId);
  const ids = referenceIds.map(toObjectId).filter(Boolean);
  if (!owner || !ids.length) return 0;
  await dbConnect();
  const open: any[] = await InternalTask.find({ referenceType, referenceId: { $in: ids }, status: { $in: OPEN_TASK_STATUSES } }).lean();
  let moved = 0;
  for (const task of open) {
    if (String(task.assignedTo || "") === String(owner)) continue;
    const updated = await InternalTask.findByIdAndUpdate(task._id, { $set: { assignedTo: owner, pool: null } }, { new: true }).lean();
    if (updated) {
      moved += 1;
      await notifyTaskReassigned(updated, "Lead owner change").catch(() => undefined);
    }
  }
  return moved;
}

// ---------------------------------------------------------------------------
// People-facing operations
// ---------------------------------------------------------------------------

async function accessActor(actor: TaskActor) {
  return { id: actor.id, role: actor.role, isSuperAdmin: actor.isSuperAdmin, pools: await poolsForActor(actor) };
}

async function assertAssignable(userId: string) {
  const user: any = await User.findById(userId).select("_id name role isActive").lean();
  if (!user || user.isActive === false) throw new TaskError("That person is not an active account.");
  if (!(MANUAL_ASSIGNEE_ROLES as readonly string[]).includes(user.role)) {
    throw new TaskError("Tasks can only be assigned to admins, sub-admins and sales staff.");
  }
  return user;
}

export async function createManualTask(input: TaskCreateInput, actor: TaskActor) {
  await dbConnect();
  await assertAssignable(input.assignedTo);
  const _id = new Types.ObjectId();
  const task: any = await InternalTask.create({
    _id,
    title: input.title,
    details: input.details || "",
    priority: input.priority,
    assignedTo: new Types.ObjectId(input.assignedTo),
    pool: null,
    source: "manual",
    kind: "manual",
    referenceType: "Manual",
    referenceId: _id,
    createdBy: new Types.ObjectId(actor.id),
    dueAt: input.dueAt || null,
    actionHref: "",
  });
  await notifyTaskCreated(task.toObject(), actor.name).catch(() => undefined);
  return task.toObject();
}

export type TaskScope = "mine" | "assigned_by_me" | "all";
export type TaskListFilter = { scope?: TaskScope; status?: "open" | "completed" | "cancelled" | "any"; source?: "auto" | "manual"; priority?: TaskPriority; q?: string; page?: number; limit?: number };

async function scopeQuery(actor: TaskActor, scope: TaskScope) {
  const me = new Types.ObjectId(actor.id);
  if (scope === "all") {
    if (!isTaskAdmin(actor)) throw new TaskError("Only admins can see every task.", 403);
    return {};
  }
  if (scope === "assigned_by_me") return { createdBy: me };
  const pools = await poolsForActor(actor);
  const clauses: any[] = [{ assignedTo: me }];
  // Unassigned tasks with no pool (older CRM-raised ones) belong to the admin team.
  if (pools.length) clauses.push({ assignedTo: null, pool: { $in: pools.includes("admins") ? [...pools, null] : pools } });
  return { $or: clauses };
}

function statusQuery(status: TaskListFilter["status"]) {
  if (status === "completed") return { status: "completed" };
  if (status === "cancelled") return { status: "cancelled" };
  if (status === "any") return {};
  return { status: { $in: OPEN_TASK_STATUSES } };
}

const PEOPLE = "name email role";

export function serializeTask(task: any) {
  const person = (value: any) => (value && typeof value === "object" && value.name !== undefined ? { _id: String(value._id), name: value.name || "", email: value.email || "" } : value ? { _id: String(value), name: "", email: "" } : null);
  return {
    _id: String(task._id),
    title: task.title,
    details: task.details || "",
    status: task.status,
    priority: task.priority,
    source: task.source || "auto",
    kind: task.kind || "",
    pool: task.pool || null,
    assignedTo: person(task.assignedTo),
    createdBy: person(task.createdBy),
    completedBy: person(task.completedBy),
    cancelledBy: person(task.cancelledBy),
    actionHref: task.actionHref || "",
    dueAt: task.dueAt ? new Date(task.dueAt).toISOString() : null,
    completedAt: task.completedAt ? new Date(task.completedAt).toISOString() : null,
    cancelledAt: task.cancelledAt ? new Date(task.cancelledAt).toISOString() : null,
    completionNotes: task.completionNotes || "",
    completionAuto: Boolean(task.completionAuto),
    cancelReason: task.cancelReason || "",
    referenceType: task.referenceType,
    createdAt: task.createdAt ? new Date(task.createdAt).toISOString() : null,
    updatedAt: task.updatedAt ? new Date(task.updatedAt).toISOString() : null,
  };
}

export type SerializedTask = ReturnType<typeof serializeTask>;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function listTasks(actor: TaskActor, filter: TaskListFilter = {}) {
  await dbConnect();
  const scope = filter.scope || "mine";
  const limit = Math.min(Math.max(filter.limit || 50, 1), 200);
  const page = Math.max(filter.page || 1, 1);
  const query: any = { $and: [await scopeQuery(actor, scope), statusQuery(filter.status)] };
  if (filter.source) query.$and.push({ source: filter.source });
  if (filter.priority) query.$and.push({ priority: filter.priority });
  if (filter.q?.trim()) {
    const rx = new RegExp(escapeRegex(filter.q.trim().slice(0, 100)), "i");
    query.$and.push({ $or: [{ title: rx }, { details: rx }] });
  }
  const open = !filter.status || filter.status === "open";
  const sort: any = open ? { priority: 1, dueAt: 1, createdAt: -1 } : { completedAt: -1, cancelledAt: -1, updatedAt: -1 };
  const [rows, total] = await Promise.all([
    InternalTask.find(query)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("assignedTo", PEOPLE)
      .populate("createdBy", PEOPLE)
      .populate("completedBy", PEOPLE)
      .populate("cancelledBy", PEOPLE)
      .lean(),
    InternalTask.countDocuments(query),
  ]);
  // "priority" sorts alphabetically (high < low < normal); put it in real order.
  const weight: Record<string, number> = { high: 0, normal: 1, low: 2 };
  const tasks = open ? (rows as any[]).sort((a, b) => (weight[a.priority] ?? 1) - (weight[b.priority] ?? 1)) : rows;
  return { tasks: (tasks as any[]).map(serializeTask), total, page, limit };
}

export async function taskSummary(actor: TaskActor) {
  await dbConnect();
  const scope = await scopeQuery(actor, "mine");
  const open = { $and: [scope, { status: { $in: OPEN_TASK_STATUSES } }] };
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [pendingCount, overdueCount, completedThisWeek, assignedByMeOpen] = await Promise.all([
    InternalTask.countDocuments(open),
    InternalTask.countDocuments({ $and: [open, { dueAt: { $ne: null, $lt: new Date() } }] }),
    InternalTask.countDocuments({ $and: [scope, { status: "completed", completedAt: { $gte: weekAgo } }] }),
    InternalTask.countDocuments({ createdBy: new Types.ObjectId(actor.id), status: { $in: OPEN_TASK_STATUSES } }),
  ]);
  return { pendingCount, overdueCount, completedThisWeek, assignedByMeOpen };
}

export async function getTaskForActor(id: string, actor: TaskActor) {
  if (!Types.ObjectId.isValid(id)) throw new TaskError("Task not found.", 404);
  await dbConnect();
  const task: any = await InternalTask.findById(id)
    .populate("assignedTo", PEOPLE)
    .populate("createdBy", PEOPLE)
    .populate("completedBy", PEOPLE)
    .populate("cancelledBy", PEOPLE)
    .lean();
  if (!task) throw new TaskError("Task not found.", 404);
  const access = await accessActor(actor);
  if (!canActOnTask(task, access)) throw new TaskError("Task not found.", 404);
  return { task, access };
}

export async function applyTaskAction(id: string, input: TaskActionInput, actor: TaskActor) {
  const { task, access } = await getTaskForActor(id, actor);
  const open = OPEN_TASK_STATUSES.includes(task.status);
  const me = new Types.ObjectId(actor.id);
  const manager = canManageTask(task, access);
  let update: any;

  switch (input.action) {
    case "complete":
      if (!open) throw new TaskError("This task is already closed.");
      if (task.source === "manual" && !input.notes) throw new TaskError("Add a short note on what was done so the assigner knows.");
      update = { status: "completed", completedAt: new Date(), completedBy: me, completionNotes: input.notes || "", completionAuto: false };
      // Picking up a pool task makes it yours.
      if (!task.assignedTo) update.assignedTo = me;
      break;
    case "start":
      if (task.status !== "pending") throw new TaskError("Only a pending task can be started.");
      update = { status: "in_progress", ...(task.assignedTo ? {} : { assignedTo: me }) };
      break;
    case "reopen":
      if (open) throw new TaskError("This task is already open.");
      if (!manager) throw new TaskError("Only the person who assigned this task can reopen it.", 403);
      update = { status: "pending", completedAt: null, completedBy: null, completionNotes: "", completionAuto: false, cancelledAt: null, cancelledBy: null, cancelReason: "", overdueNotifiedAt: null };
      break;
    case "cancel":
      if (!open) throw new TaskError("This task is already closed.");
      if (!manager) throw new TaskError("Only the person who assigned this task can cancel it.", 403);
      update = { status: "cancelled", cancelledAt: new Date(), cancelledBy: me, cancelReason: input.reason || "" };
      break;
    case "reassign": {
      if (!open) throw new TaskError("Reopen the task before reassigning it.");
      const selfHandOff = String(task.assignedTo?._id || task.assignedTo || "") === actor.id;
      if (!manager && !selfHandOff) throw new TaskError("Only the assigner or current assignee can reassign this task.", 403);
      await assertAssignable(input.assignedTo);
      update = { assignedTo: new Types.ObjectId(input.assignedTo), pool: null, overdueNotifiedAt: null };
      break;
    }
    case "update":
      if (!manager) throw new TaskError("Only the person who assigned this task can edit it.", 403);
      update = {};
      if (input.title !== undefined) update.title = input.title;
      if (input.details !== undefined) update.details = input.details;
      if (input.priority !== undefined) update.priority = input.priority;
      if (input.dueAt !== undefined) {
        update.dueAt = input.dueAt;
        update.overdueNotifiedAt = null;
      }
      break;
  }

  // Guard on the status we read so two people finishing a pool task at once
  // cannot both "complete" it.
  const saved: any = await InternalTask.findOneAndUpdate({ _id: task._id, status: task.status }, { $set: update }, { new: true }).lean();
  if (!saved) throw new TaskError("Someone else just updated this task. Refresh and try again.", 409);

  if (input.action === "complete") await notifyTaskCompleted(saved, actor.name || "").catch(() => undefined);
  if (input.action === "reassign") await notifyTaskReassigned(saved, actor.name || "").catch(() => undefined);
  if (input.action === "cancel") await notifyTaskCancelled(saved, actor.name || "").catch(() => undefined);

  const { task: fresh } = await getTaskForActor(id, actor);
  return serializeTask(fresh);
}
