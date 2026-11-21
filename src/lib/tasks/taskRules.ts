/**
 * Pure task rules — no database, so they can be unit tested and shared by the
 * API, the service and the reminder sweep.
 */
import { z } from "zod";

export type TaskPool = "admins" | "sales";
export type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled";
export type TaskPriority = "low" | "normal" | "high";

export const OPEN_TASK_STATUSES: TaskStatus[] = ["pending", "in_progress"];

/** Portal roles a task can be assigned to by hand. Other coaches only receive automatic tasks. */
export const MANUAL_ASSIGNEE_ROLES = ["admin", "sub-admin"] as const;

/**
 * Coaches who can also be handed tasks by hand (user, 2026-11-21: Dhritabrata
 * Kundu). Matched by first name, case-insensitive; override with a
 * comma-separated `TASK_ASSIGNABLE_COACH_NAMES`.
 */
export function assignableCoachNames(): string[] {
  const raw = process.env.TASK_ASSIGNABLE_COACH_NAMES ?? "Dhritabrata";
  return raw.split(",").map((name) => name.trim()).filter(Boolean);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Mongo name patterns for the coaches above (an empty list matches nobody). */
export function assignableCoachNamePatterns(): RegExp[] {
  return assignableCoachNames().map((name) => new RegExp(`^\\s*${escapeRegex(name)}\\b`, "i"));
}

export function isAssignableCoachName(name?: string | null) {
  return Boolean(name) && assignableCoachNamePatterns().some((pattern) => pattern.test(String(name)));
}

/** Roles allowed to assign tasks by hand. */
export const MANUAL_ASSIGNER_ROLES = ["admin", "sub-admin"] as const;

export function taskReminderHour() {
  const value = Number(process.env.TASK_REMINDER_HOUR);
  return Number.isInteger(value) && value >= 0 && value <= 23 ? value : 9;
}

export type TaskAccessSubject = {
  assignedTo?: unknown;
  createdBy?: unknown;
  pool?: string | null;
};

export type TaskAccessActor = {
  id: string;
  role?: string;
  isSuperAdmin?: boolean;
  pools: string[];
};

function idOf(value: unknown) {
  if (!value) return "";
  const maybe = value as { _id?: unknown };
  return String(maybe._id ?? value);
}

export function isTaskAdmin(actor: Pick<TaskAccessActor, "role" | "isSuperAdmin">) {
  return actor.role === "admin" || Boolean(actor.isSuperAdmin);
}

/** Assignee, pool member, creator or admin may see and complete a task. */
export function canActOnTask(task: TaskAccessSubject, actor: TaskAccessActor) {
  if (isTaskAdmin(actor)) return true;
  if (idOf(task.assignedTo) === actor.id) return true;
  if (idOf(task.createdBy) === actor.id) return true;
  // Older pool tasks may still carry the person who clicked Start. They remain
  // shared; explicit reassignment clears the pool and makes a task personal.
  return task.pool
    ? actor.pools.includes(task.pool)
    : Boolean(!task.assignedTo && actor.pools.includes("admins"));
}

/**
 * Only the person who assigned it (or an admin) can edit, reassign or reopen.
 * Cancelling is open to anyone who can act on the task, with a required reason.
 */
export function canManageTask(task: TaskAccessSubject, actor: TaskAccessActor) {
  return isTaskAdmin(actor) || (Boolean(task.createdBy) && idOf(task.createdBy) === actor.id);
}

export function isOverdue(task: { dueAt?: Date | string | null; status?: string }, now = new Date()) {
  return Boolean(task.dueAt && OPEN_TASK_STATUSES.includes(task.status as TaskStatus) && new Date(task.dueAt).getTime() < now.getTime());
}

const optionalText = (max: number) =>
  z.preprocess((value) => (value === null || value === "" ? undefined : value), z.string().trim().max(max).optional());

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Choose a valid person.");

const optionalDate = z.preprocess(
  (value) => (value === null || value === "" ? undefined : value),
  z.coerce.date().optional()
);

export const taskCreateSchema = z.object({
  title: z.string().trim().min(3, "Give the task a title of at least 3 characters.").max(200),
  details: optionalText(4000),
  assignedTo: objectId,
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  dueAt: optionalDate,
});

export const taskActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("complete"), notes: optionalText(2000) }),
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("reopen") }),
  z.object({
    action: z.literal("cancel"),
    reason: z.string({ required_error: "Give a reason for cancelling." }).trim().min(5, "Give a reason for cancelling (at least 5 characters).").max(500),
  }),
  z.object({ action: z.literal("reassign"), assignedTo: objectId }),
  z.object({
    action: z.literal("update"),
    title: z.string().trim().min(3).max(200).optional(),
    details: optionalText(4000),
    priority: z.enum(["low", "normal", "high"]).optional(),
    dueAt: z.preprocess((value) => (value === "" ? null : value), z.coerce.date().nullable().optional()),
  }),
]);

export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskActionInput = z.infer<typeof taskActionSchema>;

export type DigestTask = { title: string; priority?: string; dueAt?: Date | string | null; status?: string };

/** Overdue first, then high priority, then soonest due, then the rest. */
export function sortForDigest<T extends DigestTask>(tasks: T[], now = new Date()): T[] {
  const rank = (task: T) => (isOverdue(task, now) ? 0 : task.priority === "high" ? 1 : task.dueAt ? 2 : 3);
  return [...tasks].sort((a, b) => {
    const diff = rank(a) - rank(b);
    if (diff) return diff;
    const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
    const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
    return aDue - bDue;
  });
}
