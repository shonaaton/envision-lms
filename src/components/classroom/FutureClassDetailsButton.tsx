"use client";

import { useState } from "react";
import { Eye, X } from "lucide-react";

type Person = { name?: string; email?: string; username?: string };
type ClassroomDetails = {
  title?: string;
  courseName?: string;
  levelName?: string;
  topicName?: string;
  startDate?: string | Date;
  startTime?: string;
  durationMinutes?: number;
  coachName?: string;
  batchNames?: string;
  students?: Person[];
};

function formatDate(value?: string | Date) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(value));
}

function formatEndTime(dateValue: string | Date | undefined, startTime: string, durationMinutes: number) {
  if (!dateValue || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) return "Not set";
  const [hours, minutes] = startTime.split(":").map(Number);
  const end = new Date(dateValue);
  if (Number.isNaN(end.getTime())) return "Not set";
  end.setHours(hours, minutes + Math.max(15, durationMinutes), 0, 0);
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(end);
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

export default function FutureClassDetailsButton({ details, className = "btn-outline" }: { details: ClassroomDetails; className?: string }) {
  const [open, setOpen] = useState(false);
  const students = (details.students || []).map((student) => student.name || student.email || student.username || "").filter(Boolean);
  const startTime = details.startTime || "";
  const duration = Number(details.durationMinutes || 60);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <Eye size={15} aria-hidden="true" />
        View Details
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-brand">Class Details</div>
                <h2 className="mt-1 truncate text-2xl font-black text-slate-950">{details.title || "Class"}</h2>
              </div>
              <button type="button" className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50" onClick={() => setOpen(false)} aria-label="Close details">
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-3 px-5 py-5 sm:grid-cols-2">
              <DetailCard label="Batch" value={details.batchNames || "Unassigned"} />
              <DetailCard label="Course" value={details.courseName || "Course not set"} />
              <DetailCard label="Level" value={details.levelName || "Level not set"} />
              <DetailCard label="Topic" value={details.topicName || "Topic not set"} />
              <DetailCard label="Start Time" value={`${formatDate(details.startDate)} at ${startTime || "--"}`} />
              <DetailCard label="End Time" value={formatEndTime(details.startDate, startTime, duration)} />
              <DetailCard label="Coach" value={details.coachName || "Coach not assigned"} />
              <DetailCard label="Students" value={`${students.length} assigned`} />
            </div>

            <div className="border-t border-slate-100 px-5 py-4">
              <div className="mb-2 text-sm font-black text-slate-950">Students in this classroom</div>
              {students.length ? (
                <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap gap-2">
                    {students.map((name, index) => (
                      <span key={`${name}-${index}`} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">{name}</span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">No students assigned yet.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
