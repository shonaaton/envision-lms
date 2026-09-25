import "server-only";

import { formatAcademyDateTime } from "@/lib/academyTime";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { poolMembers, type TaskStaffMember } from "@/lib/tasks/taskRecipients";
import { Notification } from "@/models/Fee";
import { User } from "@/models/User";

export const TASKS_HREF = "/tasks";

export function taskHref(taskId: unknown) {
  return `${TASKS_HREF}?id=${String(taskId)}`;
}

type Recipient = TaskStaffMember;

/**
 * One in-app notification per person per `dedupKey` (the same claim-then-send
 * pattern as the demo lead-owner notices), with an optional email that only
 * goes out when the in-app claim was new — so a retried trigger never emails twice.
 */
async function deliver(
  recipient: Recipient,
  input: { type: string; title: string; message: string; dedupKey: string; href: string; email?: boolean; metadata?: Record<string, unknown> }
) {
  const inserted = await Notification.updateOne(
    { user: recipient._id, "metadata.dedupKey": input.dedupKey },
    {
      $setOnInsert: {
        user: recipient._id,
        type: input.type,
        title: input.title,
        message: input.message,
        metadata: { ...input.metadata, href: input.href, dedupKey: input.dedupKey },
      },
    },
    { upsert: true }
  );
  if (!inserted.upsertedCount) return false;
  if (input.email && recipient.email) {
    await sendAutomationEmail({
      to: recipient.email,
      subject: input.title,
      message: [`Hello ${recipient.name || "there"},`, "", input.message].join("\n"),
      actionLabel: "Open task",
      metadata: { kind: "task_manager", event: input.type, dedupKey: input.dedupKey, href: input.href, ...input.metadata },
    }).catch(() => null);
  }
  return true;
}

async function userRecipient(userId: unknown): Promise<Recipient | null> {
  if (!userId) return null;
  const user: any = await User.findById(String((userId as any)?._id ?? userId)).select("_id name email isActive").lean();
  if (!user || user.isActive === false) return null;
  return { _id: String(user._id), name: user.name || "", email: user.email || "" };
}

/** The assignee, or every member of the pool for an unassigned task. */
export async function taskAudience(task: any): Promise<Recipient[]> {
  if (task.assignedTo) {
    const one = await userRecipient(task.assignedTo);
    return one ? [one] : [];
  }
  return task.pool ? poolMembers(task.pool) : [];
}

function dueLine(task: any) {
  return task.dueAt ? `Due: ${formatAcademyDateTime(task.dueAt, { timeZoneName: "short" })}.` : "";
}

export async function notifyTaskCreated(task: any, assignerName?: string, occurrence = "") {
  const manual = task.source === "manual";
  const audience = (await taskAudience(task)).filter((person) => person._id !== String(task.createdBy || ""));
  const title = manual ? `New task from ${assignerName || "a colleague"}` : task.priority === "high" ? "New high-priority task" : "New task";
  const message = [task.title, task.details ? String(task.details).slice(0, 400) : "", dueLine(task)].filter(Boolean).join("\n");
  await Promise.all(
    audience.map((person) =>
      deliver(person, {
        type: "task_assigned",
        title,
        message,
        dedupKey: `task_created:${task._id}:${person._id}${occurrence ? `:${occurrence}` : ""}`,
        href: taskHref(task._id),
        email: manual || task.priority === "high",
        metadata: { taskId: String(task._id), taskKind: task.kind || "" },
      }).catch(() => false)
    )
  );
}

/** For hand-assigned tasks the person who asked hears back, with what was done. */
export async function notifyTaskCompleted(task: any, completerName: string) {
  if (task.source !== "manual" || !task.createdBy) return;
  if (String(task.createdBy) === String(task.completedBy || "")) return;
  const creator = await userRecipient(task.createdBy);
  if (!creator) return;
  const when = formatAcademyDateTime(task.completedAt || new Date(), { timeZoneName: "short" });
  const message = [
    `${completerName || "Your colleague"} completed "${task.title}" on ${when}.`,
    task.completionNotes ? `\nCompletion notes:\n${task.completionNotes}` : "\nNo completion notes were added.",
  ].join("\n");
  await deliver(creator, {
    type: "task_completed",
    title: `Task completed: ${task.title}`.slice(0, 160),
    message,
    dedupKey: `task_completed:${task._id}:${new Date(task.completedAt || Date.now()).getTime()}`,
    href: taskHref(task._id),
    email: true,
    metadata: { taskId: String(task._id), completedBy: String(task.completedBy || "") },
  }).catch(() => false);
}

export async function notifyTaskReassigned(task: any, actorName: string) {
  const person = await userRecipient(task.assignedTo);
  if (!person) return;
  await deliver(person, {
    type: "task_assigned",
    title: `Task reassigned to you by ${actorName || "a colleague"}`,
    message: [task.title, dueLine(task)].filter(Boolean).join("\n"),
    dedupKey: `task_reassigned:${task._id}:${person._id}:${Date.now()}`,
    href: taskHref(task._id),
    email: true,
    metadata: { taskId: String(task._id) },
  }).catch(() => false);
}

export async function notifyTaskCancelled(task: any, actorName: string) {
  const audience = (await taskAudience(task)).filter((person) => person._id !== String(task.cancelledBy || ""));
  await Promise.all(
    audience.map((person) =>
      deliver(person, {
        type: "task_cancelled",
        title: "Task cancelled",
        message: `${actorName || "A colleague"} cancelled "${task.title}".${task.cancelReason ? ` Reason: ${task.cancelReason}` : ""}`,
        dedupKey: `task_cancelled:${task._id}:${person._id}`,
        href: taskHref(task._id),
        metadata: { taskId: String(task._id) },
      }).catch(() => false)
    )
  );
}

export async function notifyTaskOverdue(task: any) {
  const audience = await taskAudience(task);
  await Promise.all(
    audience.map((person) =>
      deliver(person, {
        type: "task_overdue",
        title: "Task overdue",
        message: `"${task.title}" was due ${formatAcademyDateTime(task.dueAt, { timeZoneName: "short" })} and is still open.`,
        dedupKey: `task_overdue:${task._id}:${person._id}`,
        href: taskHref(task._id),
        email: true,
        metadata: { taskId: String(task._id) },
      }).catch(() => false)
    )
  );
}

export async function sendTaskDigest(person: Recipient, input: { dateKey: string; title: string; message: string }) {
  return deliver(person, {
    type: "task_digest",
    title: input.title,
    message: input.message,
    dedupKey: `task_digest:${person._id}:${input.dateKey}`,
    href: TASKS_HREF,
    email: true,
    metadata: { dateKey: input.dateKey },
  });
}
