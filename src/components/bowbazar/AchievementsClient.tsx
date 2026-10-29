"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Medal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BranchHeader, Drawer, Field, api } from "./shared";

type Achievement = {
  id: string;
  studentId: string;
  studentName: string;
  title: string;
  result: string;
  level: string;
  date: string;
  note: string;
  imageUrl: string;
  showOnPortal: boolean;
  createdByName: string;
};
type StudentLite = { id: string; name: string; status: string };

const LEVELS = ["Centre", "District", "State", "National", "International", "Rating", "Other"];
const LEVEL_STYLE: Record<string, string> = {
  International: "bg-purple-100 text-purple-800",
  National: "bg-amber-100 text-amber-900",
  State: "bg-sky-100 text-sky-800",
  District: "bg-emerald-100 text-emerald-800",
};
const dayText = (date: string) => (date ? new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "");

export default function AchievementsClient({ can }: { can: string[] }) {
  const [rows, setRows] = useState<Achievement[] | null>(null);
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [editing, setEditing] = useState<Partial<Achievement> | null>(null);

  const load = useCallback(() => {
    api<{ achievements: Achievement[] }>("/api/bowbazar/achievements").then((data) => setRows(data.achievements)).catch((error) => toast.error(error.message));
  }, []);
  useEffect(() => {
    load();
    api<{ students: StudentLite[] }>("/api/bowbazar/students").then((data) => setStudents(data.students)).catch(() => undefined);
  }, [load]);

  async function remove(row: Achievement) {
    if (!window.confirm(`Delete ${row.studentName}'s "${row.title}"?`)) return;
    try {
      await api(`/api/bowbazar/achievements/${row.id}`, { method: "DELETE" });
      load();
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  return (
    <div className="space-y-4">
      <BranchHeader
        title="Achievements"
        subtitle="Tournament results and milestones of Bowbazar students. They show on the student's own page."
        can={can}
        actions={
          <button type="button" className="btn-primary h-10" onClick={() => setEditing({ level: "Other", showOnPortal: true })}>
            <Plus size={16} /> Add achievement
          </button>
        }
      />
      {!rows ? (
        <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading...</div>
      ) : !rows.length ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No achievements yet. Add a student&apos;s first medal.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <article key={row.id} className="flex gap-3 rounded-lg border border-brand/10 bg-white p-3 shadow-sm">
              {row.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={row.imageUrl} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><Medal size={28} /></span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-black text-slate-950">{row.studentName}</span>
                  <span className="flex gap-1">
                    <button type="button" className="rounded p-1 text-slate-400 hover:bg-slate-100" onClick={() => setEditing(row)} aria-label="Edit"><Pencil size={14} /></button>
                    <button type="button" className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-700" onClick={() => void remove(row)} aria-label="Delete"><Trash2 size={14} /></button>
                  </span>
                </div>
                <div className="text-sm font-bold text-brand">{row.result}</div>
                <div className="text-sm text-slate-700">{row.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                  <span className={cn("rounded-full px-2 py-0.5 font-bold", LEVEL_STYLE[row.level] || "bg-slate-100 text-slate-700")}>{row.level}</span>
                  {dayText(row.date)}
                  {!row.showOnPortal && <span className="font-bold text-slate-400">· Hidden from the student</span>}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {editing && <AchievementDrawer achievement={editing} students={students} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function AchievementDrawer({ achievement, students, onClose, onSaved }: { achievement: Partial<Achievement>; students: StudentLite[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    studentId: achievement.studentId || "",
    title: achievement.title || "",
    result: achievement.result || "",
    level: achievement.level || "Other",
    date: achievement.date || "",
    note: achievement.note || "",
    showOnPortal: achievement.showOnPortal !== false,
  });
  const [image, setImage] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  async function save() {
    setSaving(true);
    try {
      const data = new FormData();
      Object.entries(form).forEach(([key, value]) => data.set(key, String(value)));
      if (image) data.set("image", image);
      const response = await fetch(achievement.id ? `/api/bowbazar/achievements/${achievement.id}` : "/api/bowbazar/achievements", { method: achievement.id ? "PATCH" : "POST", body: data });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not save.");
      toast.success("Saved.");
      onSaved();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      title={achievement.id ? "Edit achievement" : "Add achievement"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-outline h-10" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary h-10" disabled={saving} onClick={() => void save()}>
            {saving && <Loader2 size={16} className="animate-spin" />} Save
          </button>
        </>
      }
    >
      <Field label="Student *">
        <select className="input" value={form.studentId} onChange={(event) => set({ studentId: event.target.value })}>
          <option value="">Pick a student...</option>
          {students.map((student) => (
            <option key={student.id} value={student.id}>{student.name}{student.status !== "active" ? " (inactive)" : ""}</option>
          ))}
        </select>
      </Field>
      <Field label="Tournament or milestone *">
        <input className="input" value={form.title} placeholder="e.g. Kolkata District U-10 Championship" onChange={(event) => set({ title: event.target.value })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Result *">
          <input className="input" value={form.result} placeholder="1st place" onChange={(event) => set({ result: event.target.value })} />
        </Field>
        <Field label="Level">
          <select className="input" value={form.level} onChange={(event) => set({ level: event.target.value })}>
            {LEVELS.map((level) => (
              <option key={level}>{level}</option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input type="date" className="input" value={form.date} onChange={(event) => set({ date: event.target.value })} />
        </Field>
      </div>
      <Field label="Note">
        <textarea className="input min-h-[60px]" value={form.note} onChange={(event) => set({ note: event.target.value })} />
      </Field>
      <Field label="Photo" hint="Medal, trophy or certificate: JPG, PNG or WEBP under 2 MB">
        <input type="file" accept="image/jpeg,image/png,image/webp" className="text-sm" onChange={(event) => setImage(event.target.files?.[0] || null)} />
      </Field>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <input type="checkbox" checked={form.showOnPortal} onChange={(event) => set({ showOnPortal: event.target.checked })} />
        Show it on the student&apos;s page
      </label>
    </Drawer>
  );
}
