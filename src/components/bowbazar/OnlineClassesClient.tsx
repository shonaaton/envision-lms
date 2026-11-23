"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, Link2, Loader2, Pencil, Plus, Search, UserRound, Users, Video } from "lucide-react";
import { toast } from "sonner";
import { DAY_NAMES, WEEK_ORDER } from "@/lib/branch/rules";
import { cn } from "@/lib/utils";
import { BranchHeader, Drawer, Field, api } from "./shared";

type OnlineClass = {
  id: string;
  name: string;
  label: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  capacity: number;
  meetingUrl: string;
  isActive: boolean;
  coach: { id: string; name: string } | null;
  students: { id: string; name: string; regNo: string; hasLogin: boolean }[];
  meetsToday: boolean;
};

type Data = {
  today: string;
  classes: OnlineClass[];
  coaches: { id: string; name: string; role: string }[];
  students: { id: string; name: string; regNo: string; level: string }[];
  canEdit: boolean;
};

type Form = {
  id?: string;
  name: string;
  days: number[];
  startTime: string;
  endTime: string;
  capacity: number;
  coachId: string;
  meetingUrl: string;
  studentIds: string[];
  isActive: boolean;
};

const blankForm = (): Form => ({ name: "", days: [], startTime: "17:00", endTime: "18:00", capacity: 7, coachId: "", meetingUrl: "", studentIds: [], isActive: true });

export default function OnlineClassesClient({ can }: { can: string[] }) {
  const [data, setData] = useState<Data | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [showOff, setShowOff] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<Data>("/api/bowbazar/online"));
    } catch (error: any) {
      toast.error(error.message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const active = (data?.classes || []).filter((item) => item.isActive);
  const off = (data?.classes || []).filter((item) => !item.isActive);
  const today = active.filter((item) => item.meetsToday);

  return (
    <div className="space-y-4">
      <BranchHeader
        title="Online classes"
        subtitle={
          data
            ? `${active.length} online class${active.length === 1 ? "" : "es"} a week · ${today.length} today. Each runs in the academy's live room, and ending the class fills its register.`
            : "Loading..."
        }
        can={can}
        actions={
          data?.canEdit && (
            <button type="button" className="btn-primary h-10" onClick={() => setForm(blankForm())}>
              <Plus size={16} /> New online class
            </button>
          )
        }
      />

      {!data && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Loading classes...
        </div>
      )}

      {data && !data.classes.length && (
        <div className="rounded-lg border border-dashed border-brand/30 bg-white p-8 text-center text-sm text-slate-600">
          No online classes yet.
          {data.canEdit && " Make one with New online class: give it a name, its days and time, a coach and its students."}
        </div>
      )}

      {today.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Today</h2>
          <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {today.map((item) => (
              <ClassCard key={item.id} item={item} canEdit={Boolean(data?.canEdit)} onEdit={() => setForm(formFor(item))} />
            ))}
          </div>
        </section>
      )}

      {active.length > today.length && (
        <section className="space-y-2">
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Every week</h2>
          <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {active
              .filter((item) => !item.meetsToday)
              .map((item) => (
                <ClassCard key={item.id} item={item} canEdit={Boolean(data?.canEdit)} onEdit={() => setForm(formFor(item))} />
              ))}
          </div>
        </section>
      )}

      {off.length > 0 && (
        <section className="space-y-2">
          <button type="button" className="text-sm font-bold text-slate-500 underline" onClick={() => setShowOff((value) => !value)}>
            {showOff ? "Hide" : "Show"} {off.length} switched-off class{off.length === 1 ? "" : "es"}
          </button>
          {showOff && (
            <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {off.map((item) => (
                <ClassCard key={item.id} item={item} canEdit={Boolean(data?.canEdit)} onEdit={() => setForm(formFor(item))} />
              ))}
            </div>
          )}
        </section>
      )}

      {form && data && (
        <ClassForm
          form={form}
          data={data}
          onClose={() => setForm(null)}
          onSaved={async () => {
            setForm(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function formFor(item: OnlineClass): Form {
  return {
    id: item.id,
    name: item.name,
    days: [item.dayOfWeek],
    startTime: item.startTime,
    endTime: item.endTime,
    capacity: item.capacity,
    coachId: item.coach?.id || "",
    meetingUrl: item.meetingUrl,
    studentIds: item.students.map((student) => student.id),
    isActive: item.isActive,
  };
}

function ClassCard({ item, canEdit, onEdit }: { item: OnlineClass; canEdit: boolean; onEdit: () => void }) {
  const time = item.label.includes(" · ") ? item.label.split(" · ").slice(1).join(" · ") : item.label;
  return (
    <article className={cn("space-y-3 rounded-lg border bg-white p-4 shadow-sm", item.isActive ? "border-sky-200" : "border-slate-200 opacity-60")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-black text-slate-950">{item.name || "Online class"}</h3>
          <p className="text-sm font-semibold text-sky-800">{time}</p>
        </div>
        {canEdit && (
          <button type="button" className="btn-outline h-8 px-2 text-xs" onClick={onEdit}>
            <Pencil size={14} /> Edit
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1">
          <UserRound size={14} /> {item.coach ? item.coach.name : "No coach set (whoever opens it teaches)"}
        </span>
        <span className="inline-flex items-center gap-1">
          <Users size={14} /> {item.students.length}/{item.capacity} students
        </span>
        {item.meetingUrl && (
          <a href={item.meetingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand underline">
            <Link2 size={14} /> Meeting link
          </a>
        )}
      </div>
      {item.students.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {item.students.map((student) => (
            <span
              key={student.id}
              className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", student.hasLogin ? "bg-slate-100 text-slate-700" : "bg-amber-100 text-amber-900")}
              title={student.hasLogin ? student.regNo : "No login yet: can't join the live room"}
            >
              {student.name}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-amber-800">No students yet.</p>
      )}
      {item.isActive && (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {item.meetsToday ? (
            <Link href={`/bowbazar/live/${item.id}`} className="btn-primary h-9 px-3 text-sm">
              <Video size={16} /> Open live room
            </Link>
          ) : (
            <span className="text-xs text-slate-500">The live room opens here on {DAY_NAMES[item.dayOfWeek]}.</span>
          )}
          <Link href="/bowbazar/attendance" className="btn-outline h-9 px-3 text-sm">
            <ClipboardCheck size={16} /> Register
          </Link>
        </div>
      )}
    </article>
  );
}

function ClassForm({ form: initial, data, onClose, onSaved }: { form: Form; data: Data; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<Form>(initial);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const editing = Boolean(form.id);
  const set = (patch: Partial<Form>) => setForm((current) => ({ ...current, ...patch }));

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? data.students.filter((student) => `${student.name} ${student.regNo} ${student.level}`.toLowerCase().includes(q))
      : data.students;
    // Picked students first, so they're easy to see and remove.
    return [...list].sort((a, b) => Number(form.studentIds.includes(b.id)) - Number(form.studentIds.includes(a.id)));
  }, [data.students, query, form.studentIds]);

  const toggleStudent = (studentId: string) =>
    set({ studentIds: form.studentIds.includes(studentId) ? form.studentIds.filter((value) => value !== studentId) : [...form.studentIds, studentId] });
  const toggleDay = (day: number) =>
    set({ days: editing ? [day] : form.days.includes(day) ? form.days.filter((value) => value !== day) : [...form.days, day] });

  async function save() {
    if (editing && !form.isActive && initial.isActive && form.studentIds.length) {
      if (!window.confirm(`Switch off ${form.name}? Its ${form.studentIds.length} students are taken out of it. Past registers stay.`)) return;
    }
    setSaving(true);
    try {
      const body = { ...form, dayOfWeek: form.days[0] };
      if (editing) await api(`/api/bowbazar/online/${form.id}`, { method: "PATCH", json: body });
      else await api("/api/bowbazar/online", { method: "POST", json: body });
      toast.success(editing ? "Class saved." : form.days.length > 1 ? `Class made for ${form.days.length} days a week.` : "Class made.");
      await onSaved();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      title={editing ? `Edit ${initial.name || "class"}` : "New online class"}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline h-10" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary h-10" disabled={saving} onClick={() => void save()}>
            {saving && <Loader2 size={16} className="animate-spin" />} {editing ? "Save class" : "Make class"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Class name" hint="What staff and families see, for example Upasana or Level 2 evening">
          <input className="input" value={form.name} maxLength={80} onChange={(event) => set({ name: event.target.value })} />
        </Field>

        <Field label={editing ? "Day" : "Days"} hint={editing ? "Each day of a class is edited on its own." : "Pick every day it meets; each day gets its own register."}>
          <div className="flex flex-wrap gap-1.5">
            {WEEK_ORDER.map((day) => (
              <button
                key={day}
                type="button"
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm font-bold",
                  form.days.includes(day) ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-700 hover:border-brand/40"
                )}
                onClick={() => toggleDay(day)}
              >
                {DAY_NAMES[day].slice(0, 3)}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Starts">
            <input className="input" type="time" value={form.startTime} onChange={(event) => set({ startTime: event.target.value })} />
          </Field>
          <Field label="Ends">
            <input className="input" type="time" value={form.endTime} onChange={(event) => set({ endTime: event.target.value })} />
          </Field>
          <Field label="Seats">
            <input className="input" type="number" min={1} max={50} value={form.capacity} onChange={(event) => set({ capacity: Number(event.target.value) })} />
          </Field>
        </div>

        <Field label="Coach" hint="Opens the live room and is named as its coach. Branch staff only.">
          <select className="input" value={form.coachId} onChange={(event) => set({ coachId: event.target.value })}>
            <option value="">No set coach</option>
            {data.coaches.map((coach) => (
              <option key={coach.id} value={coach.id}>
                {coach.name} ({coach.role})
              </option>
            ))}
          </select>
        </Field>

        <Field label="Meeting link (optional)" hint="A Zoom or Meet link, if the class also uses one beside the live room">
          <input className="input" value={form.meetingUrl} placeholder="https://" onChange={(event) => set({ meetingUrl: event.target.value })} />
        </Field>

        {editing && (
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <input type="checkbox" checked={form.isActive} onChange={(event) => set({ isActive: event.target.checked })} />
            Class is running
          </label>
        )}

        {form.isActive && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">
                Students ({form.studentIds.length}/{form.capacity})
              </span>
              {form.studentIds.length > 0 && (
                <button type="button" className="text-xs font-bold text-slate-500 underline" onClick={() => set({ studentIds: [] })}>
                  Clear
                </button>
              )}
            </div>
            <label className="relative block">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" placeholder="Search by name, reg. no. or level" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {shown.map((student) => (
                <label key={student.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                  <input type="checkbox" checked={form.studentIds.includes(student.id)} onChange={() => toggleStudent(student.id)} />
                  <span className="font-semibold text-slate-900">{student.name}</span>
                  <span className="ml-auto text-xs text-slate-500">{[student.regNo, student.level].filter(Boolean).join(" · ")}</span>
                </label>
              ))}
              {!shown.length && <p className="px-3 py-4 text-center text-sm text-slate-500">No student matches.</p>}
            </div>
            <p className="text-xs text-slate-400">Students stay in their centre slots too. Their monthly fee is not changed here.</p>
          </div>
        )}
      </div>
    </Drawer>
  );
}
