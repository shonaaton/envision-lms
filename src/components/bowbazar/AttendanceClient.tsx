"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BookOpenCheck, CheckCheck, ChevronLeft, ChevronRight, ClipboardCheck, Loader2, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { DAY_NAMES, shiftDateKey } from "@/lib/branch/rules";
import { cn } from "@/lib/utils";
import { BranchHeader, Field, ModeBadge, api } from "./shared";

type Counts = { present: number; late: number; absent: number; excused: number; attended: number; marked: number };

type DayClass = {
  slotId: string;
  label: string;
  startTime: string;
  mode: string;
  members: number;
  movedIn: number;
  movedAway: number;
  holiday: string;
  saved: boolean;
  counts: Counts | null;
  homework: number;
  updatedByName: string;
  updatedAt: string | null;
};

type Row = {
  studentId: string;
  userId: string;
  name: string;
  regNo: string;
  member: boolean;
  guest: boolean;
  movedFrom?: string;
  left: boolean;
  status: string;
  topic: string;
  note: string;
  homeworkNote: string;
  recentTopics: { date: string; topic: string }[];
};

type RegisterHomework = {
  id: string;
  title: string;
  templateId: string;
  dueAt: string | null;
  activityCount: number;
  students: { userId: string; studentId: string; name: string; submitted: boolean; accuracy: number | null; needsReview: boolean }[];
};

type Register = {
  date: string;
  today: string;
  slot: { id: string; label: string; mode: string; startTime: string; isActive: boolean };
  saved: boolean;
  markedByName: string;
  updatedByName: string;
  updatedAt: string | null;
  rows: Row[];
  others: { studentId: string; name: string; regNo: string }[];
  away: { studentId: string; name: string; to: string; toDate: string }[];
  holiday: string;
  homework: RegisterHomework[];
  topicSuggestions: string[];
  defaultDueDate: string;
};

type Template = { id: string; title: string; topicName: string; levelName: string; courseName: string; activityCount: number };

type BranchHomeworkRow = {
  id: string;
  title: string;
  date: string;
  slotLabel: string;
  dueAt: string | null;
  assigned: number;
  submitted: number;
  needsReview: number;
};

const STATUSES = [
  { value: "present", label: "Present", on: "bg-emerald-600 text-white border-emerald-600" },
  { value: "late", label: "Late", on: "bg-amber-500 text-white border-amber-500" },
  { value: "absent", label: "Absent", on: "bg-red-600 text-white border-red-600" },
  { value: "excused", label: "Excused", on: "bg-slate-600 text-white border-slate-600" },
];

const longDate = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const shortDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const activities = (count: number) => `${count} ${count === 1 ? "activity" : "activities"}`;
const dueLabel = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : "No due date";

function countsLine(counts: Counts) {
  const parts = [`${counts.attended} came`];
  if (counts.absent) parts.push(`${counts.absent} absent`);
  if (counts.excused) parts.push(`${counts.excused} excused`);
  return parts.join(" · ");
}

export default function AttendanceClient({ can, today }: { can: string[]; today: string }) {
  const [view, setView] = useState<"register" | "homework">("register");
  return (
    <div className="space-y-4">
      <BranchHeader
        title="Attendance"
        subtitle="Take each class's register, write what each student was taught and set their homework."
        can={can}
      />
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-sm font-bold">
        {(["register", "homework"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setView(value)}
            className={cn("rounded-md px-3 py-1.5", view === value ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100")}
          >
            {value === "register" ? "Registers" : "Homework set"}
          </button>
        ))}
      </div>
      {view === "register" ? <RegisterView today={today} /> : <HomeworkView />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// A day's classes and the open register
// ---------------------------------------------------------------------------

function RegisterView({ today }: { today: string }) {
  const [date, setDate] = useState(today);
  const [classes, setClasses] = useState<DayClass[] | null>(null);
  const [selected, setSelected] = useState<string>("");

  const loadDay = useCallback(async (day: string, keep?: string) => {
    try {
      const data = await api<{ classes: DayClass[] }>(`/api/bowbazar/attendance?date=${day}`);
      setClasses(data.classes);
      setSelected((current) => {
        const wanted = keep ?? current;
        if (data.classes.some((item) => item.slotId === wanted)) return wanted;
        return (data.classes.find((item) => !item.saved) || data.classes[0])?.slotId || "";
      });
    } catch (error: any) {
      toast.error(error.message);
    }
  }, []);

  useEffect(() => {
    setClasses(null);
    void loadDay(date, "");
  }, [date, loadDay]);

  const weekday = DAY_NAMES[new Date(`${date}T00:00:00`).getDay()];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-outline h-9 px-2" onClick={() => setDate(shiftDateKey(date, -1))} aria-label="Previous day">
          <ChevronLeft size={16} />
        </button>
        <input
          type="date"
          value={date}
          max={today}
          onChange={(event) => event.target.value && setDate(event.target.value)}
          className="input h-9 w-auto"
        />
        <button
          type="button"
          className="btn-outline h-9 px-2"
          onClick={() => setDate(shiftDateKey(date, 1))}
          disabled={date >= today}
          aria-label="Next day"
        >
          <ChevronRight size={16} />
        </button>
        {date !== today && (
          <button type="button" className="btn-outline h-9 px-3 text-sm" onClick={() => setDate(today)}>
            Today
          </button>
        )}
        <span className="text-sm font-semibold text-slate-600">{longDate(date)}</span>
      </div>

      {!classes ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Loading classes...
        </div>
      ) : !classes.length ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          No classes on {weekday}s.
        </div>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {classes.map((item) => (
              <button
                key={item.slotId}
                type="button"
                onClick={() => {
                  setSelected(item.slotId);
                  // On a phone the register sits below the class list.
                  window.requestAnimationFrame(() => document.getElementById("branch-register")?.scrollIntoView({ behavior: "smooth", block: "start" }));
                }}
                className={cn(
                  "rounded-lg border bg-white p-3 text-left shadow-sm transition",
                  selected === item.slotId ? "border-brand ring-2 ring-brand/20" : "border-slate-200 hover:border-brand/40"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black text-slate-950">{item.label}</span>
                  <ModeBadge mode={item.mode} />
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {item.members} expected
                  {item.movedIn > 0 && ` · ${item.movedIn} moved in`}
                  {item.movedAway > 0 && ` · ${item.movedAway} moved away`}
                </div>
                <div className={cn("mt-2 text-xs font-bold", item.holiday ? "text-sky-800" : item.saved ? "text-emerald-700" : "text-amber-700")}>
                  {item.holiday ? `Closed: ${item.holiday}` : item.saved && item.counts ? countsLine(item.counts) : "Register not taken"}
                  {item.homework > 0 && <span className="text-slate-500"> · {item.homework} homework</span>}
                </div>
              </button>
            ))}
          </div>
          {selected && (
            <div id="branch-register" className="scroll-mt-4">
              <RegisterEditor
                key={`${selected}:${date}`}
                slotId={selected}
                date={date}
                onSaved={() => void loadDay(date, selected)}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RegisterEditor({ slotId, date, onSaved }: { slotId: string; date: string; onSaved: () => void }) {
  const [register, setRegister] = useState<Register | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [bulkTopic, setBulkTopic] = useState("");

  const apply = useCallback((data: Register) => {
    setRegister(data);
    setRows(data.rows);
    setDirty(false);
    // Notes stay open where something was written, so they are not missed.
    setOpen(Object.fromEntries(data.rows.filter((row) => row.note || row.homeworkNote).map((row) => [row.studentId, true])));
  }, []);

  useEffect(() => {
    api<Register>(`/api/bowbazar/attendance/${slotId}/${date}`)
      .then(apply)
      .catch((error) => toast.error(error.message));
  }, [slotId, date, apply]);

  // Leaving with unsaved marks loses them; ask first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const change = (studentId: string, patch: Partial<Row>) => {
    setRows((current) => current.map((row) => (row.studentId === studentId ? { ...row, ...patch } : row)));
    setDirty(true);
  };

  const homeworkByUser = useMemo(() => {
    const map = new Map<string, { hw: RegisterHomework; submitted: boolean }[]>();
    for (const hw of register?.homework || []) {
      for (const student of hw.students) {
        map.set(student.userId, [...(map.get(student.userId) || []), { hw, submitted: student.submitted }]);
      }
    }
    return map;
  }, [register]);

  if (!register) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500">
        <Loader2 size={16} className="animate-spin" /> Loading register...
      </div>
    );
  }

  const future = date > register.today;
  const marked = rows.filter((row) => row.status).length;

  const save = async () => {
    setSaving(true);
    try {
      const data = await api<Register>(`/api/bowbazar/attendance/${slotId}/${date}`, {
        method: "PUT",
        json: {
          rows: rows
            .filter((row) => row.status)
            .map(({ studentId, status, topic, note, homeworkNote }) => ({ studentId, status, topic, note, homeworkNote })),
        },
      });
      apply(data);
      toast.success("Register saved.");
      onSaved();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const addGuest = (studentId: string) => {
    const other = register.others.find((item) => item.studentId === studentId);
    if (!other) return;
    setRows((current) => [
      ...current,
      { ...other, userId: "", member: false, guest: true, left: false, status: "present", topic: "", note: "", homeworkNote: "", recentTopics: [] },
    ]);
    setRegister({ ...register, others: register.others.filter((item) => item.studentId !== studentId) });
    setDirty(true);
  };

  const dropGuest = (row: Row) => {
    setRows((current) => current.filter((item) => item.studentId !== row.studentId));
    setRegister({ ...register, others: [...register.others, { studentId: row.studentId, name: row.name, regNo: row.regNo }].sort((a, b) => a.name.localeCompare(b.name)) });
    setDirty(true);
  };

  const unassign = async (homeworkId: string, row: Row) => {
    if (dirty) return toast.error("Save the register first.");
    try {
      const data = await api<{ register: Register | null }>(`/api/bowbazar/homework/${homeworkId}?user=${row.userId}`, { method: "DELETE" });
      if (data.register) apply(data.register);
      onSaved();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <section className="rounded-lg border border-brand/10 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black text-slate-950">
            <ClipboardCheck size={18} className="text-brand" /> {register.slot.label}
            <ModeBadge mode={register.slot.mode} />
          </h2>
          <p className="text-xs text-slate-500">
            {register.saved
              ? `Taken by ${register.markedByName || "staff"}${register.updatedByName && register.updatedByName !== register.markedByName ? `, last changed by ${register.updatedByName}` : ""}`
              : "Not taken yet"}
          </p>
          {register.away.length > 0 && (
            <p className="mt-1 text-xs font-semibold text-sky-800">
              Moved to another class this week: {register.away.map((move) => `${move.name} (${move.to})`).join(", ")}
            </p>
          )}
        </div>
        {!future && rows.length > 0 && (
          <button
            type="button"
            className="btn-outline h-9 px-3 text-sm"
            onClick={() => {
              setRows((current) => current.map((row) => (row.status ? row : { ...row, status: "present" })));
              setDirty(true);
            }}
          >
            <CheckCheck size={16} /> Everyone else present
          </button>
        )}
      </div>

      {register.holiday ? (
        <p className="px-4 py-6 text-sm text-sky-900">The centre is closed for this class that day ({register.holiday}). Cancel the holiday on the Messages page to take a register.</p>
      ) : future ? (
        <p className="px-4 py-6 text-sm text-slate-500">This class hasn&apos;t happened yet. Come back on the day to take the register.</p>
      ) : (
        <>
          <datalist id="branch-topics">
            {register.topicSuggestions.map((topic) => (
              <option key={topic} value={topic} />
            ))}
          </datalist>

          {rows.length > 1 && (
            <div className="flex flex-wrap items-end gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
              <Field label="Same topic for everyone who came" className="min-w-0 flex-1">
                <input
                  className="input"
                  list="branch-topics"
                  value={bulkTopic}
                  onChange={(event) => setBulkTopic(event.target.value)}
                  placeholder="e.g. Knight forks"
                />
              </Field>
              <button
                type="button"
                className="btn-outline h-10 px-3 text-sm"
                disabled={!bulkTopic.trim()}
                onClick={() => {
                  setRows((current) =>
                    current.map((row) =>
                      (row.status === "present" || row.status === "late") && !row.topic.trim() ? { ...row, topic: bulkTopic.trim() } : row
                    )
                  );
                  setDirty(true);
                }}
              >
                Fill empty topics
              </button>
            </div>
          )}

          {!rows.length && (
            <p className="px-4 py-6 text-sm text-slate-500">No students sit in this class. Add someone below if they came for the day.</p>
          )}

          <ul className="divide-y divide-slate-100">
            {rows.map((row) => {
              const came = row.status === "present" || row.status === "late";
              const portal = homeworkByUser.get(row.userId) || [];
              return (
                <li key={row.studentId} className="space-y-2 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-bold text-slate-950">{row.name}</span>
                      {row.regNo && <span className="ml-2 text-xs text-slate-400">{row.regNo}</span>}
                      {row.movedFrom ? (
                        <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-800">Moved in from {row.movedFrom}</span>
                      ) : (
                        row.guest && <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-800">Visiting</span>
                      )}
                      {row.left && <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-700">Left</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {STATUSES.map((status) => (
                        <button
                          key={status.value}
                          type="button"
                          onClick={() => change(row.studentId, { status: row.status === status.value ? "" : status.value })}
                          className={cn(
                            "h-8 rounded-md border px-2.5 text-xs font-bold transition",
                            row.status === status.value ? status.on : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
                          )}
                        >
                          {status.label}
                        </button>
                      ))}
                      {row.guest && (
                        <button type="button" onClick={() => dropGuest(row)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100" aria-label={`Remove ${row.name}`}>
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {came && (
                    <div className="space-y-1">
                      <input
                        className="input"
                        list="branch-topics"
                        value={row.topic}
                        onChange={(event) => change(row.studentId, { topic: event.target.value })}
                        placeholder="Topic taught today"
                        aria-label={`Topic taught to ${row.name}`}
                      />
                      {row.recentTopics.length > 0 && (
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                          <span>Before:</span>
                          {row.recentTopics.map((item) => (
                            <button
                              key={`${item.date}${item.topic}`}
                              type="button"
                              className="hover:text-brand hover:underline"
                              title="Use this topic"
                              onClick={() => change(row.studentId, { topic: item.topic })}
                            >
                              {shortDate(item.date)}: {item.topic}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {row.status && (
                    <>
                      {open[row.studentId] ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Field label="Note for the family" hint="Shown on the student's page">
                            <textarea
                              className="input min-h-[60px]"
                              value={row.note}
                              maxLength={500}
                              onChange={(event) => change(row.studentId, { note: event.target.value })}
                            />
                          </Field>
                          <Field label="Homework on paper" hint="Book pages, worksheets - anything not set on the portal">
                            <textarea
                              className="input min-h-[60px]"
                              value={row.homeworkNote}
                              maxLength={500}
                              onChange={(event) => change(row.studentId, { homeworkNote: event.target.value })}
                            />
                          </Field>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="text-xs font-bold text-brand hover:underline"
                          onClick={() => setOpen((current) => ({ ...current, [row.studentId]: true }))}
                        >
                          + Note or paper homework
                        </button>
                      )}
                    </>
                  )}

                  {portal.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {portal.map(({ hw, submitted }) => (
                        <span
                          key={hw.id}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold",
                            submitted ? "bg-emerald-100 text-emerald-800" : "bg-brand-50 text-brand"
                          )}
                        >
                          <BookOpenCheck size={12} /> {hw.title}
                          {submitted ? " · done" : ""}
                          {!submitted && (
                            <button type="button" onClick={() => void unassign(hw.id, row)} aria-label={`Take ${hw.title} off ${row.name}`} className="ml-0.5 hover:text-red-700">
                              <X size={12} />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
            {register.others.length > 0 ? (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <Plus size={14} />
                <select className="input h-9 w-auto max-w-[16rem]" value="" onChange={(event) => addGuest(event.target.value)}>
                  <option value="">Add a student for today...</option>
                  {register.others.map((other) => (
                    <option key={other.studentId} value={other.studentId}>
                      {other.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-3">
              {dirty && <span className="text-xs font-bold text-amber-700">Not saved</span>}
              <button type="button" className="btn-primary h-10 px-4" disabled={saving || !marked || (!dirty && register.saved)} onClick={() => void save()}>
                {saving && <Loader2 size={16} className="animate-spin" />}
                {register.saved ? "Save changes" : `Save register (${marked}/${rows.length})`}
              </button>
            </div>
          </div>

          {register.saved && (
            <HomeworkSetter register={register} dirty={dirty} onDone={(data) => { apply(data); onSaved(); }} />
          )}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Setting portal homework from a saved register
// ---------------------------------------------------------------------------

function HomeworkSetter({ register, dirty, onDone }: { register: Register; dirty: boolean; onDone: (data: Register) => void }) {
  const [query, setQuery] = useState("");
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [picked, setPicked] = useState<Template | null>(null);
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState(register.defaultDueDate);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  // Only students already saved on the register can be given homework.
  const savedRows = useMemo(() => register.rows.filter((row) => row.status && row.userId), [register]);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      api<{ templates: Template[] }>(`/api/bowbazar/homework/templates?q=${encodeURIComponent(query)}`)
        .then((data) => setTemplates(data.templates))
        .catch((error) => toast.error(error.message));
    }, 250);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [query]);

  // Students who already have the picked homework from this register.
  const alreadySet = useMemo(() => {
    const copy = picked && register.homework.find((hw) => hw.templateId === picked.id);
    return new Set((copy?.students || []).map((student) => student.studentId));
  }, [picked, register]);

  const pick = (template: Template) => {
    const copy = register.homework.find((hw) => hw.templateId === template.id);
    const has = new Set((copy?.students || []).map((student) => student.studentId));
    setPicked(template);
    setStudentIds(
      savedRows.filter((row) => (row.status === "present" || row.status === "late") && !has.has(row.studentId)).map((row) => row.studentId)
    );
  };

  const submit = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      const data = await api<Register>(`/api/bowbazar/attendance/${register.slot.id}/${register.date}/homework`, {
        method: "POST",
        json: { templateId: picked.id, studentIds, dueDate },
      });
      toast.success(`${picked.title} set for ${studentIds.length} student${studentIds.length === 1 ? "" : "s"}.`);
      setPicked(null);
      onDone(data);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-4 py-4">
      <h3 className="flex items-center gap-2 text-sm font-black text-slate-950">
        <BookOpenCheck size={16} className="text-brand" /> Portal homework
      </h3>

      {register.homework.length > 0 && (
        <ul className="space-y-2">
          {register.homework.map((hw) => {
            const done = hw.students.filter((student) => student.submitted).length;
            return (
              <li key={hw.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-slate-900">{hw.title}</span>
                  <span className="text-xs text-slate-500">
                    Due {dueLabel(hw.dueAt)} · {done}/{hw.students.length} done
                    {done > 0 && (
                      <Link href={`/homework/${hw.id}/review`} className="ml-2 font-bold text-brand hover:underline">
                        See answers
                      </Link>
                    )}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-500">{hw.students.map((student) => student.name).join(", ")}</div>
              </li>
            );
          })}
        </ul>
      )}

      {dirty ? (
        <p className="text-xs font-bold text-amber-700">Save the register before setting homework.</p>
      ) : !savedRows.length ? (
        <p className="text-xs text-slate-500">Mark who came first.</p>
      ) : picked ? (
        <div className="space-y-3 rounded-lg border border-brand/20 bg-white p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-bold text-slate-950">{picked.title}</div>
              <div className="text-xs text-slate-500">{[picked.topicName, picked.levelName, activities(picked.activityCount)].filter(Boolean).join(" · ")}</div>
            </div>
            <button type="button" className="text-xs font-bold text-slate-500 hover:underline" onClick={() => setPicked(null)}>
              Change
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {savedRows.filter((row) => alreadySet.has(row.studentId)).map((row) => (
              <span key={row.studentId} className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800" title="Already has this homework">
                {row.name} ✓
              </span>
            ))}
            {savedRows.filter((row) => !alreadySet.has(row.studentId)).map((row) => (
              <label
                key={row.studentId}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold",
                  studentIds.includes(row.studentId) ? "border-brand bg-brand-50 text-brand" : "border-slate-200 text-slate-600"
                )}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={studentIds.includes(row.studentId)}
                  onChange={(event) =>
                    setStudentIds((current) =>
                      event.target.checked ? [...current, row.studentId] : current.filter((value) => value !== row.studentId)
                    )
                  }
                />
                {row.name}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Due by the end of">
              <input type="date" className="input h-9 w-auto" value={dueDate} min={register.today} onChange={(event) => setDueDate(event.target.value)} />
            </Field>
            <button type="button" className="btn-primary h-9 px-4" disabled={busy || !studentIds.length || !dueDate} onClick={() => void submit()}>
              {busy && <Loader2 size={14} className="animate-spin" />} Set homework
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input !pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find homework by title, topic or level"
            />
          </div>
          {templates === null ? (
            <div className="text-xs text-slate-500">Loading...</div>
          ) : !templates.length ? (
            <div className="text-xs text-slate-500">No homework matches.</div>
          ) : (
            <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white">
              {templates.map((template) => (
                <li key={template.id}>
                  <button type="button" onClick={() => pick(template)} className="w-full px-3 py-2 text-left hover:bg-brand-50">
                    <div className="text-sm font-bold text-slate-900">{template.title}</div>
                    <div className="text-xs text-slate-500">
                      {[template.topicName, template.levelName || template.courseName, activities(template.activityCount)].filter(Boolean).join(" · ")}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Everything the branch has set
// ---------------------------------------------------------------------------

function HomeworkView() {
  const [rows, setRows] = useState<BranchHomeworkRow[] | null>(null);

  useEffect(() => {
    api<{ homework: BranchHomeworkRow[] }>("/api/bowbazar/homework")
      .then((data) => setRows(data.homework))
      .catch((error) => toast.error(error.message));
  }, []);

  if (!rows) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 size={16} className="animate-spin" /> Loading homework...
      </div>
    );
  }
  if (!rows.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
        No homework set yet. Save a class&apos;s register, then set homework under it.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-brand/10 bg-white shadow-sm">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2">Class</th>
            <th className="px-4 py-2">Homework</th>
            <th className="px-4 py-2">Due</th>
            <th className="px-4 py-2">Done</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-2 text-slate-600">
                {row.date ? shortDate(row.date) : ""} <span className="text-xs text-slate-400">{row.slotLabel}</span>
              </td>
              <td className="px-4 py-2 font-bold text-slate-900">{row.title}</td>
              <td className="px-4 py-2 text-slate-600">{dueLabel(row.dueAt)}</td>
              <td className="px-4 py-2">
                <span className={cn("font-bold", row.submitted >= row.assigned ? "text-emerald-700" : "text-slate-700")}>
                  {row.submitted}/{row.assigned}
                </span>
                {row.needsReview > 0 && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">{row.needsReview} to read</span>}
              </td>
              <td className="px-4 py-2 text-right">
                {row.submitted > 0 && (
                  <Link href={`/homework/${row.id}/review`} className="text-xs font-bold text-brand hover:underline">
                    See answers
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
