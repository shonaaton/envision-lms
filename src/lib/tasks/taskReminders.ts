import "server-only";

import { academyDateKey, academyTimeOfDay, formatAcademyDateTime } from "@/lib/academyTime";
import { dbConnect } from "@/lib/db";
import { notifyTaskOverdue, sendTaskDigest } from "@/lib/tasks/taskNotifications";
import { poolMembers, type TaskStaffMember } from "@/lib/tasks/taskRecipients";
import { OPEN_TASK_STATUSES, isOverdue, sortForDigest, taskReminderHour, type TaskPool } from "@/lib/tasks/taskRules";
import { InternalTask } from "@/models/InternalTask";
import { User } from "@/models/User";

const DIGEST_LIMIT = 10;

export function digestMessage(tasks: any[], now = new Date()) {
  const sorted = sortForDigest(tasks, now);
  const overdue = sorted.filter((task) => isOverdue(task, now)).length;
  const lines = sorted.slice(0, DIGEST_LIMIT).map((task) => {
    const flags = [isOverdue(task, now) ? "OVERDUE" : "", task.priority === "high" ? "high priority" : ""].filter(Boolean).join(", ");
    const due = task.dueAt ? ` — due ${formatAcademyDateTime(task.dueAt, { hour: undefined, minute: undefined })}` : "";
    return `• ${task.title}${due}${flags ? ` (${flags})` : ""}`;
  });
  const more = sorted.length > DIGEST_LIMIT ? [`…and ${sorted.length - DIGEST_LIMIT} more.`] : [];
  const head = `You have ${sorted.length} pending task${sorted.length === 1 ? "" : "s"}${overdue ? `, ${overdue} overdue` : ""}.`;
  return [head, "", ...lines, ...more, "", "Open Tasks in the academy portal to work through them."].join("\n");
}

/**
 * Once a day, after TASK_REMINDER_HOUR academy time, everyone with open work
 * gets one digest (in-app + email). Swept hourly and claimed per person per
 * academy date, so restarts and repeat sweeps never send a second copy.
 * Also sends a one-off "overdue" notice the first sweep after a due date passes.
 */
export async function processDailyTaskReminders(now = new Date()) {
  await dbConnect();
  const overdueSent = await processOverdueTasks(now);

  const hour = Number(academyTimeOfDay(now).split(":")[0]);
  if (!(hour >= taskReminderHour())) return { digests: 0, overdueSent, skipped: "before_reminder_hour" as const };

  const dateKey = academyDateKey(now);
  const open: any[] = await InternalTask.find({ status: { $in: OPEN_TASK_STATUSES } })
    .select("title priority dueAt status assignedTo pool")
    .lean();
  if (!open.length) return { digests: 0, overdueSent };

  const byPerson = new Map<string, any[]>();
  const add = (userId: string, task: any) => {
    const list = byPerson.get(userId) || [];
    list.push(task);
    byPerson.set(userId, list);
  };

  const pools = new Map<TaskPool, TaskStaffMember[]>();
  const people = new Map<string, TaskStaffMember>();
  for (const task of open) {
    if (task.assignedTo) {
      add(String(task.assignedTo), task);
      continue;
    }
    const pool = (task.pool || "admins") as TaskPool;
    if (!pools.has(pool)) pools.set(pool, await poolMembers(pool));
    for (const member of pools.get(pool) || []) {
      people.set(member._id, member);
      add(member._id, task);
    }
  }

  const missing = Array.from(byPerson.keys()).filter((id) => !people.has(id));
  if (missing.length) {
    const users: any[] = await User.find({ _id: { $in: missing }, isActive: { $ne: false } }).select("_id name email").lean();
    for (const user of users) people.set(String(user._id), { _id: String(user._id), name: user.name || "", email: user.email || "" });
  }

  let digests = 0;
  for (const [userId, tasks] of Array.from(byPerson.entries())) {
    const person = people.get(userId);
    if (!person) continue;
    const overdue = tasks.filter((task) => isOverdue(task, now)).length;
    const sent = await sendTaskDigest(person, {
      dateKey,
      title: `Daily tasks: ${tasks.length} pending${overdue ? `, ${overdue} overdue` : ""}`,
      message: digestMessage(tasks, now),
    }).catch(() => false);
    if (sent) digests += 1;
  }
  return { digests, overdueSent };
}

async function processOverdueTasks(now: Date) {
  const due: any[] = await InternalTask.find({
    status: { $in: OPEN_TASK_STATUSES },
    dueAt: { $ne: null, $lt: now },
    overdueNotifiedAt: null,
  })
    .limit(200)
    .lean();
  let sent = 0;
  for (const task of due) {
    // Claim first so a slow send can't be repeated by the next sweep.
    const claimed = await InternalTask.updateOne({ _id: task._id, overdueNotifiedAt: null }, { $set: { overdueNotifiedAt: now } });
    if (!claimed.modifiedCount) continue;
    await notifyTaskOverdue(task).catch(() => undefined);
    sent += 1;
  }
  return sent;
}
