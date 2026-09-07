"use client";

import { useMemo, useState } from "react";
import { CalendarClock, ChevronRight, Search, UserRound, X } from "lucide-react";
import type { BatchVacancyPayload, BatchVacancyRow } from "@/lib/batchVacancy";

function slotTone(free: number) {
  if (free <= 0) return "bg-slate-100 text-slate-500";
  if (free <= 2) return "bg-amber-50 text-amber-700";
  return "bg-emerald-50 text-emerald-700";
}

function formatDate(value: string | null) {
  if (!value) return "Not scheduled";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function DetailModal({ row, onClose }: { row: BatchVacancyRow; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="border-b border-slate-100 bg-gradient-to-r from-brand to-brand-400 px-5 py-4 text-white">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/70">{row.level}</div>
              <h2 className="truncate text-lg font-bold">{row.name}</h2>
              <p className="mt-0.5 text-xs text-white/80">
                {row.freeSlots} free of {row.capacity} - {row.coach}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close details"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white transition hover:bg-white/25"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-auto p-5">
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Schedule</h3>
            {row.slots.length ? (
              <ul className="space-y-1.5">
                {row.slots.map((slot, index) => (
                  <li key={index} className="flex items-center gap-2 text-sm text-slate-800">
                    <CalendarClock size={14} className="text-brand" />
                    <span className="font-bold">{slot.label}</span>
                    <span>{slot.startTime}</span>
                    <span className="text-slate-500">({slot.durationMinutes} min)</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No recurring schedule is set on this batch.</p>
            )}
            <p className="mt-2 text-sm text-slate-600">
              Next class: <span className="font-bold text-slate-900">{formatDate(row.nextClassAt)}</span>
            </p>
          </section>

          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Course", row.courseName || "Not set"],
              ["Level", row.levelName || row.level],
              ["Classes left", row.classesLeft === null ? "Unknown" : `${row.classesLeft} of ${row.classesTotal}`],
              ["Classes done", row.classesDone === null ? "Unknown" : String(row.classesDone)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
                <div className="mt-1 text-sm font-bold text-slate-950">{value}</div>
              </div>
            ))}
          </section>

          {row.currentTopic ? (
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Currently teaching</h3>
              <p className="text-sm font-bold text-slate-900">{row.currentTopic}</p>
            </section>
          ) : null}

          {row.upcomingTopics.length ? (
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Coming up</h3>
              <ol className="list-inside list-decimal space-y-1 text-sm text-slate-700">
                {row.upcomingTopics.map((topic, index) => (
                  <li key={`${topic}-${index}`}>{topic}</li>
                ))}
              </ol>
            </section>
          ) : null}

          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              Students in this batch ({row.students.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {row.students.map((student, index) => (
                <span
                  key={`${student.name}-${index}`}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                    student.paused ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-700"
                  }`}
                >
                  <UserRound size={12} />
                  {student.name}
                  {student.paused ? " - paused" : ""}
                </span>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Coach</h3>
            <p className="text-sm text-slate-800">
              <span className="font-bold">{row.coach}</span>
              {row.coachPhone ? <span className="text-slate-500"> - {row.coachPhone}</span> : null}
            </p>
            {row.classroomTitle ? <p className="mt-1 text-xs text-slate-500">Class: {row.classroomTitle}</p> : null}
          </section>
        </div>
      </div>
    </div>
  );
}

export function BatchVacancyBoard({ data }: { data: BatchVacancyPayload }) {
  const [level, setLevel] = useState("all");
  const [course, setCourse] = useState("all");
  const [coach, setCoach] = useState("all");
  const [onlyFree, setOnlyFree] = useState(false);
  const [query, setQuery] = useState("");
  const [openRow, setOpenRow] = useState<BatchVacancyRow | null>(null);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.rows.filter((row) => {
      if (level !== "all" && (row.levelName || row.level) !== level) return false;
      if (course !== "all" && row.courseName !== course) return false;
      if (coach !== "all" && row.coach !== coach) return false;
      if (onlyFree && row.freeSlots <= 0) return false;
      if (!needle) return true;
      return [row.name, row.coach, row.courseName, row.levelName, row.scheduleLabel]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [data.rows, level, course, coach, onlyFree, query]);

  const totalFree = rows.reduce((sum, row) => sum + row.freeSlots, 0);

  return (
    <div className="min-h-screen bg-slate-50 px-4 pb-10 pt-4 text-slate-950 sm:px-6 lg:px-8">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-r from-brand to-brand-400 px-5 py-4 text-white">
          <h1 className="text-lg font-bold">Batch Vacancy</h1>
          <p className="text-xs text-white/80">
            Group batches only - individual (PIC) classes and single-student batches are excluded.
          </p>
        </div>

        {/* Level pills first: this is the filter used mid-call. */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Level</span>
          {["all", ...data.levels].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setLevel(value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                level === value ? "bg-brand text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:text-brand"
              }`}
            >
              {value === "all" ? "All levels" : value}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <label className="relative flex h-9 min-w-[220px] flex-1 items-center sm:max-w-xs">
            <Search size={15} className="pointer-events-none absolute left-3 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search batch, coach, course"
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-950 placeholder-slate-400 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10"
            />
          </label>
          <select
            value={course}
            onChange={(event) => setCourse(event.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 focus:border-brand focus:outline-none"
          >
            <option value="all">All courses</option>
            {data.courses.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            value={coach}
            onChange={(event) => setCoach(event.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 focus:border-brand focus:outline-none"
          >
            <option value="all">All coaches</option>
            {data.coaches.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700">
            <input type="checkbox" checked={onlyFree} onChange={(event) => setOnlyFree(event.target.checked)} />
            Has free slots
          </label>
          <span className="ml-auto text-xs font-semibold text-slate-500">
            {rows.length} batches - {totalFree} seats open
          </span>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5 font-bold">Batch</th>
                <th className="px-3 py-2.5 font-bold">Schedule</th>
                <th className="px-3 py-2.5 font-bold">Coach</th>
                <th className="px-3 py-2.5 font-bold">Free slots</th>
                <th className="px-3 py-2.5 font-bold">Course</th>
                <th className="px-3 py-2.5 font-bold">Level</th>
                <th className="px-3 py-2.5 font-bold">Classes left</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                    <td className="px-3 py-2.5 font-bold text-slate-950">{row.name}</td>
                    <td className="px-3 py-2.5 text-slate-700">{row.scheduleLabel}</td>
                    <td className="px-3 py-2.5 text-slate-700">{row.coach}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${slotTone(row.freeSlots)}`}>
                        {row.freeSlots} of {row.capacity}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{row.courseName || <span className="text-slate-400">-</span>}</td>
                    <td className="px-3 py-2.5 text-slate-700">{row.levelName || row.level}</td>
                    <td className="px-3 py-2.5 text-slate-700">
                      {row.classesLeft === null ? (
                        <span className="text-slate-400">Unknown</span>
                      ) : (
                        <>
                          <span className="font-bold text-slate-950">{row.classesLeft}</span>
                          <span className="text-slate-500"> of {row.classesTotal}</span>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => setOpenRow(row)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-bold text-brand transition hover:border-brand/40 hover:bg-brand-50"
                      >
                        More details <ChevronRight size={13} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-sm text-slate-500">
                    No group batches match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {openRow ? <DetailModal row={openRow} onClose={() => setOpenRow(null)} /> : null}
    </div>
  );
}
