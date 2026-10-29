"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GraduationCap, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BranchHeader, Drawer, Field, api } from "./shared";

type Paper = { tier: string; levelNumber: number; label: string };
type Result = {
  id: string;
  studentName: string;
  levelLabel: string;
  status: string;
  assignedAt: string;
  availableUntil: string;
  submittedAt: string | null;
  score: { total: number; max: number; percent: number } | null;
  positionsSolved: number;
  mcqCorrect: number;
  certificateUrl: string;
};
type SlotLite = { id: string; label: string; isActive: boolean };
type StudentLite = { id: string; name: string; status: string };

const STATUS: Record<string, { label: string; style: string }> = {
  assigned: { label: "Not started", style: "bg-amber-100 text-amber-900" },
  in_progress: { label: "Taking it", style: "bg-sky-100 text-sky-800" },
  submitted: { label: "Done", style: "bg-emerald-100 text-emerald-800" },
  expired: { label: "Missed", style: "bg-slate-200 text-slate-700" },
  cancelled: { label: "Cancelled", style: "bg-slate-200 text-slate-700" },
};
const day = (value: string | null) => (value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "");

export default function ExamsClient({ can }: { can: string[] }) {
  const [data, setData] = useState<{ papers: Paper[]; results: Result[] } | null>(null);
  const [assigning, setAssigning] = useState(false);
  const load = useCallback(() => {
    api<{ papers: Paper[]; results: Result[] }>("/api/bowbazar/exams").then(setData).catch((error) => toast.error(error.message));
  }, []);
  useEffect(load, [load]);

  async function cancel(row: Result) {
    if (!window.confirm(`Cancel ${row.studentName}'s ${row.levelLabel} exam?`)) return;
    try {
      await api(`/api/bowbazar/exams/${row.id}`, { method: "DELETE" });
      load();
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  return (
    <div className="space-y-4">
      <BranchHeader
        title="Exams"
        subtitle="The academy's level exams for Bowbazar students. They sit it on the portal within 7 days and get a certificate."
        can={can}
        actions={
          <button type="button" className="btn-primary h-10" disabled={!data?.papers.length} onClick={() => setAssigning(true)}>
            <Plus size={16} /> Assign an exam
          </button>
        }
      />
      {data && !data.papers.length && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No exam paper has been published by the academy yet.</p>
      )}
      <section className="overflow-x-auto rounded-lg border border-brand/10 bg-white shadow-sm">
        {!data ? (
          <div className="flex items-center gap-2 p-5 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading...</div>
        ) : !data.results.length ? (
          <div className="p-8 text-center text-sm text-slate-500">No exams assigned to Bowbazar students yet.</div>
        ) : (
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-2">Student</th><th className="px-4 py-2">Exam</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Score</th><th className="px-4 py-2" /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.results.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-2 font-semibold text-slate-900">{row.studentName}</td>
                  <td className="px-4 py-2 text-slate-700">{row.levelLabel}<div className="text-xs text-slate-400">Assigned {day(row.assignedAt)} · open till {day(row.availableUntil)}</div></td>
                  <td className="px-4 py-2"><span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", STATUS[row.status]?.style || "bg-slate-100")}>{STATUS[row.status]?.label || row.status}</span></td>
                  <td className="px-4 py-2">
                    {row.score ? (
                      <span className="font-bold">{row.score.total}/{row.score.max} <span className="text-xs font-normal text-slate-500">({row.score.percent}%)</span></span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                    {row.certificateUrl && <a href={row.certificateUrl} target="_blank" rel="noreferrer" className="ml-2 text-xs font-bold text-brand underline">Certificate</a>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {row.status === "assigned" && (
                      <button type="button" className="text-xs font-bold text-red-700 hover:underline" onClick={() => void cancel(row)}>Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {assigning && data && <AssignDrawer papers={data.papers} onClose={() => setAssigning(false)} onDone={() => { setAssigning(false); load(); }} />}
    </div>
  );
}

function AssignDrawer({ papers, onClose, onDone }: { papers: Paper[]; onClose: () => void; onDone: () => void }) {
  const [paper, setPaper] = useState(`${papers[0].tier}:${papers[0].levelNumber}`);
  const [slots, setSlots] = useState<SlotLite[]>([]);
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [slotIds, setSlotIds] = useState<string[]>([]);
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    Promise.all([api<{ slots: SlotLite[] }>("/api/bowbazar/slots"), api<{ students: StudentLite[] }>("/api/bowbazar/students")])
      .then(([slotData, studentData]) => {
        setSlots(slotData.slots.filter((slot) => slot.isActive));
        setStudents(studentData.students.filter((student) => student.status === "active"));
      })
      .catch((error) => toast.error(error.message));
  }, []);
  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]);
  const picked = useMemo(() => slotIds.length + studentIds.length, [slotIds, studentIds]);

  async function save() {
    setSaving(true);
    try {
      const [tier, levelNumber] = paper.split(":");
      const result = await api<{ assigned: number; skipped: { name?: string; reason: string }[] }>("/api/bowbazar/exams", { method: "POST", json: { tier, levelNumber: Number(levelNumber), slotIds, studentIds } });
      toast.success(`Assigned to ${result.assigned}.${result.skipped.length ? ` ${result.skipped.length} skipped (${result.skipped.map((entry) => entry.reason).join("; ")}).` : ""}`);
      onDone();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      title="Assign an exam"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-outline h-10" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary h-10" disabled={saving || !picked} onClick={() => void save()}>
            {saving && <Loader2 size={16} className="animate-spin" />} <GraduationCap size={16} /> Assign
          </button>
        </>
      }
    >
      <Field label="Exam">
        <select className="input" value={paper} onChange={(event) => setPaper(event.target.value)}>
          {papers.map((entry) => (
            <option key={`${entry.tier}:${entry.levelNumber}`} value={`${entry.tier}:${entry.levelNumber}`}>{entry.label}</option>
          ))}
        </select>
      </Field>
      <div className="space-y-1">
        <div className="text-xs font-bold text-slate-600">Whole classes</div>
        <div className="flex flex-wrap gap-1">
          {slots.map((slot) => (
            <button key={slot.id} type="button" onClick={() => setSlotIds(toggle(slotIds, slot.id))} className={cn("rounded-full border px-2.5 py-1 text-xs font-bold", slotIds.includes(slot.id) ? "border-brand bg-brand-50 text-brand" : "border-slate-200 text-slate-600")}>
              {slot.label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <div className="text-xs font-bold text-slate-600">Or chosen students</div>
        <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-100">
          {students.map((student) => (
            <label key={student.id} className="flex cursor-pointer items-center gap-2 border-b border-slate-50 px-3 py-1.5 text-sm">
              <input type="checkbox" checked={studentIds.includes(student.id)} onChange={() => setStudentIds(toggle(studentIds, student.id))} />
              {student.name}
            </label>
          ))}
        </div>
      </div>
      <p className="text-xs text-slate-500">Students and families are told by the academy&apos;s usual exam messages. Anyone who already has that exam open is skipped.</p>
    </Drawer>
  );
}
