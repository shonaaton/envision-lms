"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ArrowLeft, CalendarDays, GraduationCap, RefreshCw, Search, UserX, Users } from "lucide-react";
import { toast } from "sonner";

type Person = { _id: string; name?: string; username?: string; email?: string; isActive?: boolean; deactivatedAt?: string };

type ClosedClassroom = {
  _id: string;
  title?: string;
  courseName?: string;
  levelName?: string;
  classroomType?: string;
  closedAt?: string;
  coach?: Person;
  instructor?: Person;
  students?: Person[];
  closedForStudents?: Person[];
  batches?: { _id: string; name?: string }[];
  generatedSessions?: { status?: string }[];
  removedSessions?: { status?: string }[];
};

type ClosedBatch = {
  _id: string;
  name?: string;
  level?: string;
  closedAt?: string;
  coach?: Person;
  students?: Person[];
  closedForStudents?: Person[];
};

type CoachSummary = {
  coach: string;
  name: string;
  username?: string;
  email?: string;
  isActive?: boolean;
  closedClassrooms: number;
  closedBatches: number;
  total: number;
  lastClosedAt: string | null;
};

type Payload = {
  manager: boolean;
  classrooms: ClosedClassroom[];
  batches: ClosedBatch[];
  coaches: CoachSummary[];
  totals: { classrooms: number; batches: number; groups: number };
};

type BackfillResult = {
  studentsScanned: number;
  studentsChanged: number;
  invoicesVoided: number;
  classroomsClosed: number;
  batchesClosed: number;
  classroomsPaused: number;
  batchesPaused: number;
};

const EMPTY: Payload = { manager: false, classrooms: [], batches: [], coaches: [], totals: { classrooms: 0, batches: 0, groups: 0 } };

function personName(person?: Person) {
  return person?.name || person?.username || person?.email || "";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function StatTile({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm">
      <span className="grid h-9 w-9 flex-none place-items-center rounded-md bg-brand/10 text-brand">{icon}</span>
      <span className="min-w-0">
        <span className="block text-lg font-bold leading-tight text-slate-950">{value}</span>
        <span className="block text-xs font-semibold text-slate-500">{label}</span>
      </span>
    </div>
  );
}

function ClosedForList({ people }: { people?: Person[] }) {
  const names = (people || []).map(personName).filter(Boolean);
  if (!names.length) return <span className="text-slate-400">-</span>;
  return <span title={names.join(", ")}>{names.join(", ")}</span>;
}

export default function ClosedClassroomsClient({ role }: { role: "admin" | "sub-admin" | "instructor" }) {
  // Seeded from the role so the admin sections do not flash in after the fetch.
  const [data, setData] = useState<Payload>({ ...EMPTY, manager: role !== "instructor" });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [coachFilter, setCoachFilter] = useState("");
  const [pending, setPending] = useState<BackfillResult | null>(null);
  const [backfilling, setBackfilling] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/classrooms/closed", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Could not load closed batches");
      setData({ ...EMPTY, manager: role !== "instructor", ...payload });
      // Students deactivated or paused before this clean-up existed still have
      // open batches and standing invoices. Admins are told how many, and can
      // catch them up from here rather than from a terminal.
      if (payload?.manager) {
        const outstanding = await fetch("/api/admin/students/lifecycle-backfill", { cache: "no-store" });
        if (outstanding.ok) setPending(await outstanding.json());
      }
    } catch {
      toast.error("Closed batches could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    load();
  }, [load]);

  async function runBackfill() {
    setBackfilling(true);
    try {
      const response = await fetch("/api/admin/students/lifecycle-backfill", { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "The clean-up could not be run");
      toast.success(
        `Closed ${payload.batchesClosed} batch(es) and ${payload.classroomsClosed} classroom(s), paused ${payload.batchesPaused} batch(es) and ${payload.classroomsPaused} classroom(s), voided ${payload.invoicesVoided} invoice(s) across ${payload.studentsChanged} student(s).`
      );
      setLoading(true);
      await load();
    } catch (error: any) {
      toast.error(error?.message || "The clean-up could not be run.");
    } finally {
      setBackfilling(false);
    }
  }

  const query = search.trim().toLowerCase();

  const matches = useCallback(
    (name: string, coach?: Person, students?: Person[], closedFor?: Person[]) => {
      if (coachFilter && String(coach?._id || "") !== coachFilter) return false;
      if (!query) return true;
      const haystack = [name, personName(coach), ...(students || []).map(personName), ...(closedFor || []).map(personName)]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    },
    [coachFilter, query]
  );

  const classrooms = useMemo(
    () => data.classrooms.filter((item) => matches(item.title || "", item.coach || item.instructor, item.students, item.closedForStudents)),
    [data.classrooms, matches]
  );
  const batches = useMemo(
    () => data.batches.filter((item) => matches(item.name || "", item.coach, item.students, item.closedForStudents)),
    [data.batches, matches]
  );

  return (
    <div className="space-y-3 px-4 py-4 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-brand">
            <Archive size={12} /> Closed batches
          </div>
          <h1 className="text-lg font-bold leading-tight text-slate-950">Deactivated Classrooms</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Batches and classrooms that were closed because their last active student was deactivated. They no longer appear in Classes,
            Calendar, or Attendance, and the classes they never taught have been taken off the calendar.
          </p>
        </div>
        <Link
          href="/classrooms"
          className="inline-flex h-8 w-fit items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <ArrowLeft size={13} /> Back to Classes
        </Link>
      </div>

      {data.manager && pending && pending.studentsChanged > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="font-bold">{pending.studentsChanged} student{pending.studentsChanged === 1 ? "" : "s"} out of circulation still have open groups.</div>
            <div className="mt-0.5 text-xs">
              They were deactivated or paused before those actions started closing and pausing batches: {pending.batchesClosed} batch(es) and {pending.classroomsClosed} classroom(s) to close,
              {" "}{pending.batchesPaused} batch(es) and {pending.classroomsPaused} classroom(s) to pause, and {pending.invoicesVoided} upcoming invoice(s) still standing.
            </div>
          </div>
          <button
            type="button"
            onClick={runBackfill}
            disabled={backfilling}
            className="inline-flex h-9 w-fit items-center gap-1.5 rounded-md bg-amber-600 px-3 text-xs font-bold text-white shadow-sm hover:bg-amber-700 disabled:opacity-60"
          >
            <RefreshCw size={13} className={backfilling ? "animate-spin" : ""} />
            {backfilling ? "Working..." : "Bring them up to date"}
          </button>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-3">
        <StatTile label="Closed batches" value={data.totals.batches} icon={<Users size={17} />} />
        <StatTile label="Closed classrooms" value={data.totals.classrooms} icon={<GraduationCap size={17} />} />
        <StatTile label={data.manager ? "Coaches affected" : "Closed for you"} value={data.manager ? data.coaches.length : data.totals.groups} icon={<UserX size={17} />} />
      </div>

      <div className="grid gap-2 rounded-md border border-slate-200 bg-white p-2 shadow-sm md:grid-cols-[minmax(220px,1fr)_220px]">
        <label className="relative block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="input h-9 pl-9 text-sm"
            placeholder="Search by batch, coach, or student"
          />
        </label>
        {data.manager && (
          <select value={coachFilter} onChange={(event) => setCoachFilter(event.target.value)} className="input h-9 text-sm">
            <option value="">All coaches</option>
            {data.coaches.map((coach) => (
              <option key={coach.coach} value={coach.coach}>
                {coach.name} ({coach.total})
              </option>
            ))}
          </select>
        )}
      </div>

      {data.manager && (
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-3 py-2">
            <h2 className="text-sm font-bold text-slate-950">Closed batches per coach</h2>
            <p className="text-xs text-slate-500">How many groups have been closed under each coach since student deactivation started closing them.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-3 py-2">Coach</th>
                  <th className="px-3 py-2">Closed batches</th>
                  <th className="px-3 py-2">Closed classrooms</th>
                  <th className="px-3 py-2">Total closed</th>
                  <th className="px-3 py-2">Last closed</th>
                </tr>
              </thead>
              <tbody>
                {data.coaches.map((coach) => (
                  <tr key={coach.coach} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => setCoachFilter(coach.coach)} className="font-semibold text-brand hover:underline">
                        {coach.name}
                      </button>
                      <div className="text-xs text-slate-500">{coach.username || coach.email || "-"}</div>
                    </td>
                    <td className="px-3 py-2 font-semibold">{coach.closedBatches}</td>
                    <td className="px-3 py-2 font-semibold">{coach.closedClassrooms}</td>
                    <td className="px-3 py-2 font-bold text-rose-600">{coach.total}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{formatDate(coach.lastClosedAt)}</td>
                  </tr>
                ))}
                {!loading && data.coaches.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-5 text-center text-sm text-slate-500">
                      No batch has been closed for any coach yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
          <h2 className="text-sm font-bold text-slate-950">Closed batches</h2>
          <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-bold text-brand">{batches.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="px-3 py-2">Batch</th>
                <th className="px-3 py-2">Coach</th>
                <th className="px-3 py-2">Closed for</th>
                <th className="px-3 py-2">Level</th>
                <th className="px-3 py-2">Closed on</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr key={batch._id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="px-3 py-2 font-semibold text-slate-950">{batch.name || "Batch"}</td>
                  <td className="px-3 py-2">{personName(batch.coach) || "-"}</td>
                  <td className="max-w-xs truncate px-3 py-2 text-xs text-slate-600"><ClosedForList people={batch.closedForStudents} /></td>
                  <td className="px-3 py-2 text-xs text-slate-500">{batch.level || "-"}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{formatDate(batch.closedAt)}</td>
                </tr>
              ))}
              {!loading && batches.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-5 text-center text-sm text-slate-500">
                    {loading ? "Loading..." : "No closed batches."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
          <h2 className="text-sm font-bold text-slate-950">Closed classrooms</h2>
          <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-bold text-brand">{classrooms.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="px-3 py-2">Classroom</th>
                <th className="px-3 py-2">Coach</th>
                <th className="px-3 py-2">Closed for</th>
                <th className="px-3 py-2">Course</th>
                <th className="px-3 py-2">Classes removed</th>
                <th className="px-3 py-2">Closed on</th>
              </tr>
            </thead>
            <tbody>
              {classrooms.map((item) => {
                // Closing takes the never-taught classes off the calendar and stashes them here.
                const removed = (item.removedSessions || []).length;
                return (
                  <tr key={item._id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <div className="font-semibold text-slate-950">{item.title || "Classroom"}</div>
                      <div className="text-xs text-slate-500">{(item.batches || []).map((batch) => batch.name).filter(Boolean).join(", ") || "No group"}</div>
                    </td>
                    <td className="px-3 py-2">{personName(item.coach || item.instructor) || "-"}</td>
                    <td className="max-w-xs truncate px-3 py-2 text-xs text-slate-600"><ClosedForList people={item.closedForStudents} /></td>
                    <td className="px-3 py-2 text-xs text-slate-500">{[item.courseName, item.levelName].filter(Boolean).join(" - ") || "-"}</td>
                    <td className="px-3 py-2 text-xs font-semibold text-slate-600">
                      <span className="inline-flex items-center gap-1"><CalendarDays size={12} /> {removed}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">{formatDate(item.closedAt)}</td>
                  </tr>
                );
              })}
              {!loading && classrooms.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-5 text-center text-sm text-slate-500">
                    {loading ? "Loading..." : "No closed classrooms."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
