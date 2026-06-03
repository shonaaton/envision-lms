"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function AttendancePage() {
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [records, setRecords] = useState<Record<string, "present" | "absent" | "late" | "excused">>({});

  useEffect(() => { fetch("/api/classrooms").then((r) => r.json()).then(setClassrooms); }, []);

  async function loadClass(id: string) {
    const r = await fetch(`/api/classrooms/${id}`).then((x) => x.json());
    setSelected(r);
    const init: any = {};
    r.students?.forEach((s: any) => (init[s._id] = "present"));
    setRecords(init);
  }

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
    if (!res.ok) return toast.error("Save failed");
    toast.success("Attendance saved");
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl text-accent">Attendance</h1>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <select className="input" onChange={(e) => loadClass(e.target.value)} defaultValue="">
          <option value="" disabled>Select classroom</option>
          {classrooms.map((c) => <option key={c._id} value={c._id}>{c.title}</option>)}
        </select>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button className="btn-accent" onClick={save} disabled={!selected}>Save</button>
      </div>
      {selected && (
        <div className="card divide-y divide-ink-700">
          {selected.students?.map((s: any) => (
            <div key={s._id} className="flex items-center justify-between py-3">
              <div>
                <div className="text-white">{s.name}</div>
                <div className="text-xs text-gray-400">{s.email}</div>
              </div>
              <select className="input w-40" value={records[s._id]} onChange={(e) => setRecords((r) => ({ ...r, [s._id]: e.target.value as any }))}>
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="late">Late</option>
                <option value="excused">Excused</option>
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
