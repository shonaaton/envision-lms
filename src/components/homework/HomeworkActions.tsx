"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Eye, Pencil, Trash2 } from "lucide-react";

export default function HomeworkActions({ homework }: { homework: any }) {
  const router = useRouter();

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

  return (
    <div className="flex flex-wrap gap-2">
      <Link href={`/homework/${homework._id}/review`} className="rounded-md border border-slate-200 p-2 text-slate-700 hover:bg-slate-50" title="Review submissions">
        <Eye size={14} />
      </Link>
      <button type="button" className="rounded-md border border-slate-200 p-2 text-slate-700 hover:bg-slate-50" onClick={editTitle} title="Edit title and description">
        <Pencil size={14} />
      </button>
      <button type="button" className="rounded-md border border-slate-200 p-2 text-purple-700 hover:bg-purple-50" onClick={extendDueDate} title="Extend due date">
        <CalendarClock size={14} />
      </button>
      <button type="button" className="rounded-md border border-red-100 p-2 text-red-600 hover:bg-red-50" onClick={deleteHomework} title="Delete homework">
        <Trash2 size={14} />
      </button>
    </div>
  );
}
