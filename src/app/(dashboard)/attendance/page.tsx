"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type AttendanceStatus = "present" | "absent" | "late" | "excused";

export default function AttendancePage() {
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [records, setRecords] = useState<Record<string, AttendanceStatus>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/classrooms")
      .then((r) => r.json())
      .then(setClassrooms);
  }, []);

  async function hydrateRecords(classroomId: string, nextDate: string, classroomData?: any) {
    const source = classroomData || selected;
    if (!source) return;
    const init: Record<string, AttendanceStatus> = {};
    source.students?.forEach((student: any) => {
      init[student._id] = "present";
    });

    const params = new URLSearchParams({ classroom: classroomId, sessionDate: nextDate });
    const existing = await fetch(`/api/attendance?${params.toString()}`, { cache: "no-store" }).then((res) => res.json());
    const row = Array.isArray(existing) ? existing[0] : null;
    if (row?.records?.length) {
      row.records.forEach((record: any) => {
        init[record.student?._id || record.student] = record.status;
      });
    }
    setRecords(init);
  }

  async function loadClass(id: string) {
    if (!id) return;
    setLoading(true);
    const classroom = await fetch(`/api/classrooms/${id}`, { cache: "no-store" }).then((x) => x.json());
    setSelected(classroom);
    await hydrateRecords(id, date, classroom);
    setLoading(false);
  }

  useEffect(() => {
    if (!selected?._id) return;
    hydrateRecords(selected._id, date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function save() {
    if (!selected) return;
    const res = await fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        classroom: selected._id,
        sessionDate: date,
        records: Object.entries(records).map(([student, status]) => ({ student, status })),
      }),
    });
    if (!res.ok) return toast.error("Attendance could not be saved");
    toast.success("Attendance saved");
  }

  const counts = useMemo(() => ({
    present: Object.values(records).filter((value) => value === "present").length,
    absent: Object.values(records).filter((value) => value === "absent").length,
    late: Object.values(records).filter((value) => value === "late").length,
  }), [records]);

  return (
    <div className="space-y-6 text-slate-950">
      <div>
        <h1 className="font-display text-3xl text-brand">Attendance</h1>
        <p className="mt-1 text-sm text-slate-500">Mark present, absent, or late for each student without losing previous saved attendance.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-3xl border border-brand/10 bg-white p-4 shadow-[0_18px_45px_rgba(90,19,114,0.08)] md:grid-cols-[minmax(0,1fr)_220px_180px]">
        <select className="input bg-white text-slate-950" onChange={(e) => loadClass(e.target.value)} defaultValue="">
          <option value="" disabled>Select classroom</option>
          {classrooms.map((classroom) => <option key={classroom._id} value={classroom._id}>{classroom.title}</option>)}
        </select>
        <input className="input bg-white text-slate-950" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button className="btn-primary h-11" onClick={save} disabled={!selected || loading}>{loading ? "Loading..." : "Save Attendance"}</button>
      </div>

      {selected && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryCard label="Present" value={counts.present} tone="emerald" />
            <SummaryCard label="Absent" value={counts.absent} tone="rose" />
            <SummaryCard label="Late" value={counts.late} tone="amber" />
          </div>

          <div className="rounded-3xl border border-brand/10 bg-white p-4 shadow-[0_18px_45px_rgba(90,19,114,0.08)]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-950">{selected.title}</h2>
                <p className="text-sm text-slate-500">{selected.students?.length || 0} students on {date}</p>
              </div>
            </div>

            <div className="space-y-3">
              {selected.students?.map((student: any) => (
                <div key={student._id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="font-semibold text-slate-950">{student.name}</div>
                    <div className="text-xs text-slate-500">{student.username || student.email}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {([
                      ["present", "Present", "emerald"],
                      ["absent", "Absent", "rose"],
                      ["late", "Late", "amber"],
                    ] as const).map(([value, label, tone]) => {
                      const active = records[student._id] === value;
                      const style =
                        tone === "emerald"
                          ? active ? "border-emerald-300 bg-emerald-100 text-emerald-800" : "border-slate-200 bg-white text-slate-700"
                          : tone === "rose"
                            ? active ? "border-rose-300 bg-rose-100 text-rose-800" : "border-slate-200 bg-white text-slate-700"
                            : active ? "border-amber-300 bg-amber-100 text-amber-800" : "border-slate-200 bg-white text-slate-700";
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setRecords((current) => ({ ...current, [student._id]: value }))}
                          className={`min-w-[108px] rounded-xl border px-4 py-2 text-sm font-semibold transition ${style}`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: "emerald" | "rose" | "amber" }) {
  const style =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
      : tone === "rose"
        ? "bg-rose-50 text-rose-700 border-rose-100"
        : "bg-amber-50 text-amber-700 border-amber-100";

  return (
    <div className={`rounded-2xl border p-4 ${style}`}>
      <div className="text-xs font-bold uppercase tracking-[0.16em]">{label}</div>
      <div className="mt-2 text-2xl font-black">{value}</div>
    </div>
  );
}
