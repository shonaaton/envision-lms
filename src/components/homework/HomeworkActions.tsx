"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Eye, Mail, Pencil, Trash2 } from "lucide-react";

export type HomeworkActionPermissions = {
  canEdit?: boolean;
  canDelete?: boolean;
  canRemind?: boolean;
};

export default function HomeworkActions({
  homework,
  compact = false,
  permissions,
}: {
  homework: any;
  compact?: boolean;
  permissions?: HomeworkActionPermissions;
}) {
  const router = useRouter();
  const [reminderSending, setReminderSending] = useState(false);
  const canEdit = permissions?.canEdit ?? true;
  const canDelete = permissions?.canDelete ?? true;
  const canRemind = permissions?.canRemind ?? true;

  async function update(payload: Record<string, unknown>, message: string) {
    const response = await fetch(`/api/homework/${homework._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return toast.error("Could not update homework");
    toast.success(message);
    router.refresh();
  }

  async function editTitle() {
    const title = window.prompt("Edit homework title", homework.title || "");
    if (!title?.trim()) return;
    const description = window.prompt("Edit description", homework.description || "") ?? homework.description;
    await update({ title: title.trim(), description }, "Homework updated");
  }

  async function extendDueDate() {
    const current = homework.dueAt ? new Date(homework.dueAt).toISOString().slice(0, 16) : "";
    const value = window.prompt("New due date and time, format YYYY-MM-DDTHH:mm", current);
    if (!value) return;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return toast.error("Invalid date");
    await update({ dueAt: date.toISOString() }, "Due date extended");
  }

  async function deleteHomework() {
    if (!window.confirm(`Delete "${homework.title}"? Students will no longer see it.`)) return;
    const response = await fetch(`/api/homework/${homework._id}`, { method: "DELETE" });
    if (!response.ok) return toast.error("Could not delete homework");
    toast.success("Homework deleted");
    router.refresh();
  }

  async function sendReminder() {
    if (reminderSending) return;
    setReminderSending(true);
    try {
      const response = await fetch(`/api/homework/${homework._id}/reminders`, { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) return toast.error(payload?.error || "Could not send reminder");
      toast.success(`Reminder sent to ${payload.delivered || 0} student${payload.delivered === 1 ? "" : "s"}`);
    } finally {
      setReminderSending(false);
    }
  }

  return (
    <div className={`flex flex-wrap gap-2 ${compact ? "justify-end" : ""}`}>
      <Link href={`/homework/${homework._id}/review`} className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-700 shadow-sm hover:bg-slate-50" title="Review submissions">
        <Eye size={14} />
        {!compact && <span>View</span>}
      </Link>
      {canEdit && (
        <>
          <button type="button" className={`${compact ? "hidden 2xl:inline-flex" : "inline-flex"} h-9 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-700 shadow-sm hover:bg-slate-50`} onClick={editTitle} title="Edit title and description">
            <Pencil size={14} />
            {!compact && <span>Edit</span>}
          </button>
          <button type="button" className={`${compact ? "hidden 2xl:inline-flex" : "inline-flex"} h-9 items-center justify-center gap-1 rounded-md border border-purple-100 bg-white px-2 text-[11px] font-bold text-purple-700 shadow-sm hover:bg-purple-50`} onClick={extendDueDate} title="Extend due date">
            <CalendarClock size={14} />
            {!compact && <span>Extend Due Date</span>}
          </button>
        </>
      )}
      {canRemind && (
        <button type="button" disabled={reminderSending} className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-emerald-100 bg-white px-2 text-[11px] font-bold text-emerald-700 shadow-sm hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50" onClick={sendReminder} title="Send homework reminder email">
          <Mail size={14} />
          {!compact && <span>{reminderSending ? "Sending" : "Send Reminder"}</span>}
        </button>
      )}
      {canDelete && (
        <button type="button" className={`${compact ? "hidden 2xl:inline-flex" : "inline-flex"} h-9 items-center justify-center gap-1 rounded-md border border-red-100 bg-white px-2 text-[11px] font-bold text-red-600 shadow-sm hover:bg-red-50`} onClick={deleteHomework} title="Delete homework">
          <Trash2 size={14} />
          {!compact && <span>Delete</span>}
        </button>
      )}
    </div>
  );
}
