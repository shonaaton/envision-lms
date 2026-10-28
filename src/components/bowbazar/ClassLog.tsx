import Link from "next/link";
import { BookOpenCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export type ClassLogEntry = {
  date: string;
  slotLabel: string;
  mode: string;
  status: string;
  topic: string;
  note: string;
  homeworkNote: string;
  guest: boolean;
};

export type ClassLogHomework = { id: string; title: string; dueAt: string | Date | null; submitted: boolean; accuracy: number | null };

const STATUS_LABEL: Record<string, string> = { present: "Present", late: "Late", absent: "Absent", excused: "Excused" };
const STATUS_STYLE: Record<string, string> = {
  present: "bg-emerald-100 text-emerald-800",
  late: "bg-amber-100 text-amber-900",
  absent: "bg-red-100 text-red-800",
  excused: "bg-slate-200 text-slate-700",
};

const dayLabel = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const dueLabel = (value: string | Date | null) =>
  value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : "";

/** A student's classes, newest first: attendance, what was taught and any note. Used by staff and the student. */
export function ClassLogList({ classes, empty = "No classes recorded yet." }: { classes: ClassLogEntry[]; empty?: string }) {
  if (!classes.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {classes.map((entry) => (
        <li key={`${entry.date}${entry.slotLabel}`} className="space-y-1 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-bold text-slate-900">
              {dayLabel(entry.date)} <span className="font-normal text-slate-500">{entry.slotLabel}</span>
            </span>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", STATUS_STYLE[entry.status] || "bg-slate-100 text-slate-600")}>
              {STATUS_LABEL[entry.status] || entry.status}
            </span>
          </div>
          {entry.topic && (
            <div className="text-sm text-slate-700">
              <span className="text-slate-500">Topic: </span>
              {entry.topic}
            </div>
          )}
          {entry.homeworkNote && (
            <div className="text-sm text-slate-700">
              <span className="text-slate-500">Homework: </span>
              {entry.homeworkNote}
            </div>
          )}
          {entry.note && <div className="rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-600">{entry.note}</div>}
        </li>
      ))}
    </ul>
  );
}

export function HomeworkLogList({ homework, linkTo }: { homework: ClassLogHomework[]; linkTo: (id: string) => string }) {
  if (!homework.length) return <p className="text-sm text-slate-500">No portal homework yet.</p>;
  return (
    <ul className="space-y-1.5">
      {homework.map((item) => (
        <li key={item.id}>
          <Link
            href={linkTo(item.id)}
            className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm hover:bg-brand-50"
          >
            <span className="flex min-w-0 items-center gap-2 font-semibold text-slate-900">
              <BookOpenCheck size={14} className="shrink-0 text-brand" />
              <span className="truncate">{item.title}</span>
            </span>
            <span className={cn("shrink-0 text-xs font-bold", item.submitted ? "text-emerald-700" : "text-amber-700")}>
              {item.submitted ? `Done${item.accuracy !== null ? ` · ${item.accuracy}%` : ""}` : item.dueAt ? `Due ${dueLabel(item.dueAt)}` : "To do"}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
