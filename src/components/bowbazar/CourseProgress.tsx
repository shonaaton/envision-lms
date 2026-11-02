import { Check, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";

export type CourseProgressData = {
  courseName: string;
  levelName: string;
  since: string | null;
  topics: { id: string; name: string; sessionCount: number; taught: number; done: boolean }[];
  done: number;
  total: number;
  next: string;
  complete: boolean;
};

const sinceLabel = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "";

/** A student's course level with each syllabus topic ticked off as it is taught. */
export function CourseProgress({ course }: { course: CourseProgressData }) {
  const percent = course.total ? Math.round((course.done / course.total) * 100) : 0;
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand">
          <GraduationCap size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-black text-slate-950">{course.courseName}</div>
          <div className="text-sm text-slate-600">
            {[course.levelName, course.since ? `since ${sinceLabel(course.since)}` : ""].filter(Boolean).join(" · ")}
          </div>
        </div>
        {course.total > 0 && (
          <div className="text-right">
            <div className="text-lg font-black text-slate-950">{course.done}/{course.total}</div>
            <div className="text-xs font-semibold text-slate-500">topics done</div>
          </div>
        )}
      </div>
      {course.total > 0 && (
        <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
        </div>
      )}
      {course.complete ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">Every topic of this level has been taught.</p>
      ) : course.next ? (
        <p className="text-sm text-slate-700">
          <span className="font-bold">Next:</span> {course.next}
        </p>
      ) : null}
      {course.topics.length > 0 && (
        <ol className="space-y-1">
          {course.topics.map((topic) => (
            <li key={topic.id || topic.name} className="flex items-center gap-2 text-sm">
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                  topic.done ? "border-emerald-500 bg-emerald-500 text-white" : topic.taught ? "border-amber-400 bg-amber-50" : "border-slate-300"
                )}
              >
                {topic.done && <Check size={12} strokeWidth={3} />}
              </span>
              <span className={cn("min-w-0 flex-1", topic.done ? "text-slate-500" : "text-slate-900")}>{topic.name}</span>
              {topic.sessionCount > 1 && (
                <span className="shrink-0 text-xs text-slate-500">
                  {Math.min(topic.taught, topic.sessionCount)}/{topic.sessionCount} classes
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      {!course.topics.length && <p className="text-sm text-slate-500">This level has no topics listed yet.</p>}
    </div>
  );
}
